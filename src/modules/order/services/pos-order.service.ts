import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { toDatabaseId, toEntityId } from '../../../common/identifiers/entity-id';
import { AuditWriter } from '../../audit/audit.writer';
import type { AuthPrincipal } from '../../auth/auth.types';
import { ScopeType } from '../../iam/iam.types';
import { InventoryReservationService } from '../../checkout/inventory-reservation.service';
import { FulfillmentService } from '../../fulfillment/services/fulfillment.service';
import { FlashSaleService } from '../../promotion/services/flash-sale.service';
import type { OrderDetailDto } from '../dto/order.dto';
import type {
  CreatePosOrderDto,
  PosCatalogQueryDto,
  PosCatalogResponseDto,
} from '../dto/pos-order.dto';
import { OrderService } from './order.service';

/** Bán tại quầy: khách cầm hàng về ngay nên không có phí giao và không có cửa sổ chờ. */
const POS_SHIPPING_METHOD = 'BRANCH_FREE';
/** Đơn nhân viên lập hộ có giao hàng đi theo phương thức giao tiêu chuẩn như đơn của khách. */
const DELIVERY_SHIPPING_METHOD = 'STANDARD_DELIVERY';
const POS_CHANNEL = 'STORE';

/** Hình dạng tối thiểu để tính tồn: hàng lẻ có `components` rỗng, combo thì không. */
interface SellableVariant {
  id: bigint;
  sku: string;
  components: Array<{ variantId: bigint; quantity: number }>;
}

/**
 * Quy tắc lập đơn của nhân viên, tách riêng để đọc được cả ba nhánh cùng lúc và test không cần
 * dựng nguyên service.
 *
 * - Thu tiền ngay với tiền mặt và chuyển khoản tại quầy; COD là thu khi giao nên đơn phải để
 *   payment ở trạng thái chờ, ghi SUCCESS sẽ làm báo cáo đếm tiền chưa về.
 * - Đơn tại quầy mặc định giao ngay; đơn có địa chỉ giao mặc định để kho xử lý theo luồng thường,
 *   trừ khi nhân viên chọn khách lấy luôn.
 */
export function resolveOrderCreationPlan(input: {
  paymentMethod: string;
  delivery?: unknown;
  handOverImmediately?: boolean;
}): { settleNow: boolean; handOverNow: boolean; shippingMethod: string } {
  const isDelivery = Boolean(input.delivery);
  return {
    settleNow: input.paymentMethod !== 'COD',
    handOverNow: input.handOverImmediately ?? !isDelivery,
    shippingMethod: isDelivery ? DELIVERY_SHIPPING_METHOD : POS_SHIPPING_METHOD,
  };
}

@Injectable()
export class PosOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrderService,
    private readonly reservations: InventoryReservationService,
    private readonly fulfillments: FulfillmentService,
    private readonly flashSales: FlashSaleService,
    private readonly audit: AuditWriter,
  ) {}

  /**
   * Tạo đơn bán tại quầy.
   *
   * Đi qua ĐÚNG đường của đơn online — checkout session, đặt chỗ tồn kho, rồi
   * `OrderService.place()` vốn khoá `FOR UPDATE` cả hai. Không có đường trừ kho
   * riêng cho quầy, vì hai đường song song là nguồn gốc của bán vượt hàng.
   *
   * Sau khi tạo đơn, tự chạy tiếp `CONFIRMED → PICKING → PACKED → SHIPPED → DELIVERED`.
   * Bước `SHIPPED` mới là nơi tồn kho thực sự bị trừ, nên không được bỏ qua.
   */
  async create(
    input: CreatePosOrderDto,
    idempotencyKey: string,
    requestId: string,
    principal: AuthPrincipal,
  ): Promise<OrderDetailDto> {
    const key = idempotencyKey.trim();
    if (!key || key.length > 150) {
      throw new BadRequestException('Không gửi được yêu cầu. Vui lòng thử lại.');
    }

    const warehouse = await this.resolveCounter(principal, input.branchId);
    // Kiểm tồn SỚM, trước khi tạo khách/giỏ/checkout. Bước đặt chỗ thật ở dưới mới là
    // nơi chống tranh chấp, nhưng nếu để nó báo hết hàng thì đã kịp đẻ ra một loạt
    // bản ghi mồ côi không ai dọn.
    await this.assertAvailable(input, warehouse.id);
    const customerId = await this.resolveCustomer(input, requestId, principal);
    const checkoutToken = await this.buildCheckout(input, warehouse, customerId, key, requestId, principal);

    await this.reservations.confirm(checkoutToken, `${key}:reserve`, requestId, {
      actorType: 'SYSTEM',
    });

    const placed = await this.orders.place(checkoutToken, key, requestId, {
      type: 'STAFF',
      principal,
      branchId: warehouse.branchId,
    });

    const plan = resolveOrderCreationPlan(input);
    if (plan.settleNow) {
      await this.settlePayment(placed, input, requestId, principal);
    }
    if (!plan.handOverNow) return placed;
    return this.handOver(placed, key, requestId, principal);
  }

  /** Chặn sớm trường hợp hết hàng để không tạo rác; tranh chấp vẫn do bước đặt chỗ xử lý. */
  /**
   * Danh mục hàng bán được tại quầy: hàng lẻ và combo đang bán, kèm giá hiện hành và
   * tồn khả dụng tại kho của chi nhánh đang đứng quầy.
   *
   * Không dùng lookup biến thể dùng chung của catalog: lookup đó cố tình loại combo ra
   * vì nó phục vụ việc chọn thành phần combo, và nó không biết chi nhánh nào đang bán.
   */
  async searchCatalog(
    query: PosCatalogQueryDto,
    principal: AuthPrincipal,
  ): Promise<PosCatalogResponseDto> {
    const warehouse = await this.resolveCounter(principal, query.branchId);
    const search = query.search?.trim();
    const where: Prisma.ProductVariantWhereInput = {
      status: 'ACTIVE',
      product: { status: { not: 'ARCHIVED' } },
      ...(search
        ? {
            OR: [
              { sku: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.productVariant.findMany({
        where,
        orderBy: [{ sku: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          sku: true,
          name: true,
          prices: {
            where: { status: 'ACTIVE', channel: 'ONLINE', priceType: 'REGULAR' },
            orderBy: { startsAt: 'desc' },
            take: 1,
            select: { amount: true },
          },
          bundleDefinition: {
            select: {
              items: {
                orderBy: { sortOrder: 'asc' },
                select: {
                  quantity: true,
                  componentVariant: { select: { id: true, sku: true, name: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.productVariant.count({ where }),
    ]);

    // Dùng lại chính dữ liệu vừa lấy thay vì hỏi lại cấu trúc combo: mỗi lượt đi
    // database là ~450ms trên đường truyền hiện tại.
    const variants: SellableVariant[] = rows.map((row) => ({
      id: row.id,
      sku: row.sku,
      components: (row.bundleDefinition?.items ?? []).map((item) => ({
        variantId: item.componentVariant.id,
        quantity: item.quantity,
      })),
    }));
    const availability = this.computeAvailable(
      variants,
      await this.availableOf(variants, warehouse.id),
    );

    return {
      items: rows.map((row) => {
        const components = row.bundleDefinition?.items ?? [];
        return {
          id: toEntityId(row.id),
          sku: row.sku,
          name: row.name,
          unitPrice: row.prices[0]?.amount.toFixed(2) ?? null,
          isBundle: components.length > 0,
          components: components.map((component) => ({
            productVariantId: toEntityId(component.componentVariant.id),
            sku: component.componentVariant.sku,
            name: component.componentVariant.name,
            quantity: component.quantity,
          })),
          availableQuantity: availability.get(row.id.toString())?.available ?? 0,
        };
      }),
      page: query.page,
      limit: query.limit,
      total,
      hasMore: query.page * query.limit < total,
      branchId: toEntityId(warehouse.branchId),
    };
  }

  /**
   * Tồn khả dụng của từng biến thể, tính từ tồn của các biến thể CÓ dòng tồn kho.
   *
   * Combo KHÔNG có dòng tồn riêng — tồn nằm ở các thành phần, và bước đặt chỗ cũng nổ
   * combo ra thành phần trước khi giữ hàng. Nên combo quy về thành phần thiếu nhất;
   * tra thẳng tồn của chính biến thể combo sẽ luôn ra 0 và chặn nhầm cả đơn.
   *
   * Hàm thuần: nơi gọi tự quyết định lấy dữ liệu bằng mấy lượt truy vấn.
   */
  private computeAvailable(
    variants: SellableVariant[],
    availableOf: ReadonlyMap<string, number>,
  ): Map<string, { sku: string; available: number }> {
    const result = new Map<string, { sku: string; available: number }>();
    for (const variant of variants) {
      const available =
        variant.components.length === 0
          ? (availableOf.get(variant.id.toString()) ?? 0)
          : Math.min(
              ...variant.components.map((component) =>
                Math.floor(
                  (availableOf.get(component.variantId.toString()) ?? 0) / component.quantity,
                ),
              ),
            );
      result.set(variant.id.toString(), { sku: variant.sku, available: Math.max(available, 0) });
    }
    return result;
  }

  /** Các biến thể thực sự có dòng tồn kho: hàng lẻ tính chính nó, combo tính thành phần. */
  private stockedVariantIds(variants: SellableVariant[]): bigint[] {
    const ids = new Set<bigint>();
    for (const variant of variants) {
      if (variant.components.length === 0) ids.add(variant.id);
      else for (const component of variant.components) ids.add(component.variantId);
    }
    return [...ids];
  }

  private async availableOf(
    variants: SellableVariant[],
    warehouseId: bigint,
  ): Promise<Map<string, number>> {
    const stockedIds = this.stockedVariantIds(variants);
    if (stockedIds.length === 0) return new Map();
    const balances = await this.prisma.inventoryBalance.findMany({
      where: { warehouseId, productVariantId: { in: stockedIds } },
      select: { productVariantId: true, onHand: true, reserved: true },
    });
    return new Map(
      balances.map((row) => [row.productVariantId.toString(), row.onHand - row.reserved]),
    );
  }

  private async assertAvailable(input: CreatePosOrderDto, warehouseId: bigint): Promise<void> {
    const rows = await this.prisma.productVariant.findMany({
      where: { id: { in: input.items.map((item) => toDatabaseId(item.productVariantId)) } },
      select: {
        id: true,
        sku: true,
        bundleDefinition: {
          select: { items: { select: { componentVariantId: true, quantity: true } } },
        },
      },
    });
    const variants: SellableVariant[] = rows.map((row) => ({
      id: row.id,
      sku: row.sku,
      components: (row.bundleDefinition?.items ?? []).map((item) => ({
        variantId: item.componentVariantId,
        quantity: item.quantity,
      })),
    }));
    const availability = this.computeAvailable(
      variants,
      await this.availableOf(variants, warehouseId),
    );

    for (const item of input.items) {
      const entry = availability.get(toDatabaseId(item.productVariantId).toString());
      const available = entry?.available ?? 0;
      if (available < item.quantity) {
        const sku = entry?.sku ?? item.productVariantId;
        throw new ConflictException(
          `Kho quầy không đủ hàng cho ${sku}: còn ${available}, cần ${item.quantity}`,
        );
      }
    }
  }

  private async resolveCounter(
    principal: AuthPrincipal,
    requestedBranchId: string | undefined,
  ): Promise<{ id: bigint; branchId: bigint }> {
    const isGlobal = principal.scopes.some(({ type }) => type === ScopeType.GLOBAL);
    const branchIds = principal.scopes.flatMap(({ type, branchId }) =>
      type === ScopeType.BRANCH && branchId ? [toDatabaseId(branchId)] : [],
    );

    let branchId: bigint;
    if (isGlobal) {
      if (!requestedBranchId) {
        throw new BadRequestException(
          'Tài khoản phạm vi toàn hệ thống phải chọn chi nhánh bán hàng',
        );
      }
      branchId = toDatabaseId(requestedBranchId);
    } else {
      if (branchIds.length !== 1) {
        throw new ForbiddenException(
          'Bán tại quầy cần tài khoản thuộc đúng một chi nhánh',
        );
      }
      branchId = branchIds[0];
      if (requestedBranchId && toDatabaseId(requestedBranchId) !== branchId) {
        throw new ForbiddenException('Không được bán từ kho của chi nhánh khác');
      }
    }

    const warehouse = await this.prisma.warehouse.findFirst({
      where: { branchId, status: 'ACTIVE' },
      select: { id: true, branchId: true },
    });
    if (!warehouse) throw new ConflictException('Chi nhánh chưa có kho đang hoạt động');
    return warehouse;
  }

  /** Khách cũ tìm theo số điện thoại; chưa có thì tạo mới để lần sau tra được bảo hành. */
  private async resolveCustomer(
    input: CreatePosOrderDto,
    requestId: string,
    principal: AuthPrincipal,
  ): Promise<bigint> {
    const normalizedPhone = input.customer.phone.trim();
    const existing = await this.prisma.customer.findFirst({
      where: { normalizedPhone, status: 'ACTIVE' },
      select: { id: true },
    });
    if (existing) return existing.id;

    return this.prisma.$transaction(async (transaction) => {
      const created = await transaction.customer.create({
        data: {
          customerNo: `POS-${Date.now().toString(36).toUpperCase()}`,
          name: input.customer.name.trim(),
          phone: normalizedPhone,
          normalizedPhone,
          email: input.customer.email?.trim() || null,
          normalizedEmail: input.customer.email?.trim().toLowerCase() || null,
          status: 'ACTIVE',
        },
      });
      await this.audit.write(
        {
          requestId,
          sequenceNo: 1,
          actorType: 'USER',
          actorUserId: principal.userId,
          action: 'customer.create.pos',
          entityType: 'CUSTOMER',
          entityId: toEntityId(created.id),
          after: { name: created.name, phone: normalizedPhone },
        },
        transaction,
      );
      return created.id;
    });
  }

  private async buildCheckout(
    input: CreatePosOrderDto,
    warehouse: { id: bigint; branchId: bigint },
    customerId: bigint,
    key: string,
    requestId: string,
    principal: AuthPrincipal,
  ): Promise<string> {
    const variantIds = input.items.map((item) => toDatabaseId(item.productVariantId));
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds }, status: 'ACTIVE' },
      include: {
        prices: {
          where: { status: 'ACTIVE', channel: 'ONLINE', priceType: 'REGULAR' },
          orderBy: { startsAt: 'desc' },
          take: 1,
        },
        bundleDefinition: {
          include: { items: { include: { componentVariant: true } } },
        },
      },
    });
    const byId = new Map(variants.map((variant) => [variant.id, variant]));
    for (const item of input.items) {
      const variant = byId.get(toDatabaseId(item.productVariantId));
      if (!variant) throw new BadRequestException(`Sản phẩm ${item.productVariantId} không bán được`);
      if (variant.prices.length === 0) {
        throw new ConflictException(`Sản phẩm ${variant.sku} chưa có giá bán`);
      }
    }

    // Flash sale áp cho cả đơn tại quầy: khách tới cửa hàng phải được cùng giá với web.
    const deals = await this.flashSales.resolveActiveDeals(this.prisma, variantIds, new Date());

    const lines = input.items.map((item) => {
      const variant = byId.get(toDatabaseId(item.productVariantId))!;
      const deal = deals.get(variant.id);
      const dealApplies =
        deal !== undefined &&
        deal.availableQuantity >= item.quantity &&
        (deal.perCustomerLimit === null || item.quantity <= deal.perCustomerLimit);
      const unitPrice = dealApplies ? deal.salePrice : variant.prices[0].amount;
      return {
        variant,
        quantity: item.quantity,
        unitPrice,
        lineTotal: unitPrice.times(item.quantity),
        flashSaleItemId: dealApplies ? deal.flashSaleItemId : null,
        componentSnapshot: variant.bundleDefinition
          ? variant.bundleDefinition.items.map((component) => ({
              productVariantId: toEntityId(component.componentVariantId),
              sku: component.componentVariant.sku,
              quantity: component.quantity,
            }))
          : null,
      };
    });

    const itemSubtotal = lines.reduce(
      (total, line) => total.add(line.lineTotal),
      new Prisma.Decimal(0),
    );
    const checkoutToken = randomUUID();
    const branch = await this.prisma.branch.findUniqueOrThrow({
      where: { id: warehouse.branchId },
      select: { name: true, addressJson: true },
    });

    await this.prisma.$transaction(async (transaction) => {
      // `carts_active_customer_key` chỉ cho mỗi khách một giỏ ACTIVE. Giỏ tại quầy là
      // giỏ giao dịch dùng một lần của phiên bán, không phải giỏ online của khách — gắn
      // nó vào customerId sẽ đụng giỏ khách đang có trên storefront. Định danh giỏ theo
      // chính phiên checkout; khách vẫn gắn vào đơn qua `checkoutSession.customerId`.
      const cart = await transaction.cart.create({
        data: {
          anonymousTokenHash: createHash('sha256').update(checkoutToken).digest('hex'),
          branchId: warehouse.branchId,
          status: 'ACTIVE',
        },
      });
      const cartItems = await Promise.all(
        lines.map((line) =>
          transaction.cartItem.create({
            data: {
              cartId: cart.id,
              productVariantId: line.variant.id,
              quantity: line.quantity,
              unitPricePreview: line.unitPrice,
              priceSeenAt: new Date(),
            },
          }),
        ),
      );

      await transaction.checkoutSession.create({
        data: {
          checkoutToken,
          cartId: cart.id,
          customerId,
          branchId: warehouse.branchId,
          warehouseId: warehouse.id,
          status: 'QUOTED',
          paymentMethod: input.paymentMethod,
          shippingMethod: resolveOrderCreationPlan(input).shippingMethod,
          customerNote: input.note?.trim() || null,
          itemSubtotal,
          shippingTotal: new Prisma.Decimal(0),
          grandTotal: itemSubtotal,
          etaMinDays: 0,
          etaMaxDays: 0,
          // Khách nhận hàng tại quầy nên "người nhận" là chính khách, địa chỉ là
          // địa chỉ chi nhánh bán — trung thực hơn là bịa địa chỉ giao của khách.
          // Phải đúng hình dạng `CheckoutRecipientDto`: đặt đơn đọc snapshot này để dựng
          // địa chỉ nhận của đơn và sẽ từ chối nếu thiếu recipient/addressLine/province.
          recipientSnapshot: (input.delivery
            ? {
                recipient: input.delivery.recipient.trim(),
                phone: input.delivery.phone.trim(),
                email: input.customer.email?.trim() || undefined,
                addressLine: input.delivery.addressLine.trim(),
                province: input.delivery.province.trim(),
                provinceCode: input.delivery.provinceCode.trim(),
                ...(input.delivery.district ? { district: input.delivery.district.trim() } : {}),
                ...(input.delivery.districtCode
                  ? { districtCode: input.delivery.districtCode.trim() }
                  : {}),
                ...(input.delivery.ward ? { ward: input.delivery.ward.trim() } : {}),
                ...(input.delivery.wardCode ? { wardCode: input.delivery.wardCode.trim() } : {}),
              }
            : {
                recipient: input.customer.name.trim(),
                phone: input.customer.phone.trim(),
                email: input.customer.email?.trim() || undefined,
                ...this.branchAddressSnapshot(branch),
              }) as unknown as Prisma.InputJsonValue,
          shippingRuleSnapshot: {
            method: resolveOrderCreationPlan(input).shippingMethod,
            channel: POS_CHANNEL,
            soldByUserId: principal.userId,
            quotedAt: new Date().toISOString(),
          } as unknown as Prisma.InputJsonValue,
          idempotencyKey: `${key}:checkout`,
          requestHash: checkoutToken,
          expiresAt: new Date(Date.now() + 30 * 60_000),
          items: {
            create: lines.map((line, index) => ({
              cartItemId: cartItems[index].id,
              productVariantId: line.variant.id,
              itemType: line.variant.bundleDefinition ? 'BUNDLE' : 'STANDARD',
              skuSnapshot: line.variant.sku,
              nameSnapshot: line.variant.name,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              lineTotal: line.lineTotal,
              componentSnapshot: line.componentSnapshot as unknown as Prisma.InputJsonValue,
              flashSaleItemId: line.flashSaleItemId,
            })),
          },
        },
      });

      await this.audit.write(
        {
          requestId,
          sequenceNo: 1,
          actorType: 'USER',
          actorUserId: principal.userId,
          action: 'checkout.pos.create',
          entityType: 'CHECKOUT_SESSION',
          entityId: checkoutToken,
          after: {
            branchId: toEntityId(warehouse.branchId),
            warehouseId: toEntityId(warehouse.id),
            paymentMethod: input.paymentMethod,
            itemCount: lines.length,
          },
        },
        transaction,
      );
    });

    return checkoutToken;
  }

  /** Tiền đã cầm trên tay nên ghi nhận ngay, kèm người thu để đối soát ca. */
  private async settlePayment(
    order: OrderDetailDto,
    input: CreatePosOrderDto,
    requestId: string,
    principal: AuthPrincipal,
  ): Promise<void> {
    const orderId = toDatabaseId(order.id);
    await this.prisma.$transaction(async (transaction) => {
      const payment = await transaction.payment.findFirstOrThrow({
        where: { orderId },
        select: { id: true, expectedAmount: true, currencyCode: true },
      });
      const now = new Date();
      await transaction.payment.update({
        where: { id: payment.id },
        data: {
          status: 'SUCCESS',
          receivedAmount: payment.expectedAmount,
          confirmedBy: toDatabaseId(principal.userId),
          confirmedAt: now,
          version: { increment: 1 },
        },
      });
      await transaction.order.update({
        where: { id: orderId },
        data: { paymentStatus: 'SUCCESS', version: { increment: 1 } },
      });
      await transaction.paymentTransaction.create({
        data: {
          paymentId: payment.id,
          transactionType: 'CONFIRMED',
          provider: input.paymentMethod === 'CASH' ? 'INTERNAL_COD' : 'MANUAL_BANK_TRANSFER',
          externalId: order.orderNo,
          idempotencyKey: `pos:${order.orderNo}:settle`,
          requestHash: input.paymentMethod,
          amount: payment.expectedAmount,
          currencyCode: payment.currencyCode,
          status: 'SUCCESS',
          rawPayloadRedacted: {
            channel: POS_CHANNEL,
            method: input.paymentMethod,
            soldByUserId: principal.userId,
            note: input.note?.trim() ?? null,
          },
          occurredAt: now,
        },
      });
      await this.audit.write(
        {
          requestId,
          sequenceNo: 1,
          actorType: 'USER',
          actorUserId: principal.userId,
          action: 'payment.pos.collect',
          entityType: 'PAYMENT',
          entityId: toEntityId(payment.id),
          after: { method: input.paymentMethod, amount: payment.expectedAmount.toFixed(2) },
        },
        transaction,
      );
    });
  }

  /**
   * Chạy hết vòng giao hàng ngay tại quầy. Mỗi bước là một giao dịch riêng có khoá
   * và kiểm version của chính nó — không gộp được, và cũng không nên gộp: đi tắt
   * qua `SHIPPED` là tồn kho không bao giờ bị trừ.
   */
  private async handOver(
    placed: OrderDetailDto,
    key: string,
    requestId: string,
    principal: AuthPrincipal,
  ): Promise<OrderDetailDto> {
    // `placed` được chụp trước bước thu tiền; ghi nhận thanh toán đã tăng version của
    // đơn nên số hiệu ở đây đã cũ. Đọc lại ngay trước khi xác nhận để khoá lạc quan so
    // đúng bản hiện hành — vẫn giữ khoá, không nới lỏng nó.
    const current = await this.orders.getAdmin(placed.id, principal);
    await this.orders.confirmAdmin(
      placed.id,
      { expectedVersion: current.version },
      `${key}:confirm`,
      requestId,
      principal,
    );

    let fulfillment = await this.fulfillments.getByOrder(placed.id, principal);
    for (const step of ['pick', 'pack', 'ship', 'deliver'] as const) {
      fulfillment = await this.fulfillments[step](
        fulfillment.id,
        { expectedVersion: fulfillment.version },
        `${key}:${step}`,
        requestId,
        principal,
      );
    }

    return this.orders.getAdmin(placed.id, principal);
  }

  /**
   * Khách nhận hàng ngay tại quầy nên địa chỉ nhận là địa chỉ chi nhánh bán —
   * trung thực hơn là bịa địa chỉ giao của khách. `provinceCode` là bắt buộc ở
   * snapshot đơn; chi nhánh thiếu trường này là lỗi dữ liệu, phải báo rõ thay vì
   * để nghiệp vụ vỡ ở tầng sâu hơn với thông điệp khó lần.
   */
  private branchAddressSnapshot(branch: { name: string; addressJson: Prisma.JsonValue }) {
    const address = (branch.addressJson ?? {}) as Record<string, unknown>;
    const text = (key: string): string | undefined => {
      const value = address[key];
      return typeof value === 'string' && value.trim() ? value.trim() : undefined;
    };
    const addressLine = text('addressLine');
    const province = text('province');
    const provinceCode = text('provinceCode');
    if (!addressLine || !province || !provinceCode) {
      throw new ConflictException(
        `Địa chỉ chi nhánh "${branch.name}" thiếu addressLine/province/provinceCode, chưa bán tại quầy được`,
      );
    }
    return {
      addressLine,
      province,
      provinceCode,
      district: text('district') ?? '',
      districtCode: text('districtCode'),
      ward: text('ward'),
      wardCode: text('wardCode'),
      pickupAtBranch: branch.name,
    };
  }

}
