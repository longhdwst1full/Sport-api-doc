import { randomUUID } from 'node:crypto';
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
import type { CreatePosOrderDto } from '../dto/pos-order.dto';
import { OrderService } from './order.service';

/** Bán tại quầy: khách cầm hàng về ngay nên không có phí giao và không có cửa sổ chờ. */
const POS_SHIPPING_METHOD = 'BRANCH_FREE';
const POS_CHANNEL = 'STORE';

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
      throw new BadRequestException('Header Idempotency-Key hợp lệ là bắt buộc');
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

    await this.settlePayment(placed, input, requestId, principal);
    return this.handOver(placed, key, requestId, principal);
  }

  /** Chặn sớm trường hợp hết hàng để không tạo rác; tranh chấp vẫn do bước đặt chỗ xử lý. */
  private async assertAvailable(input: CreatePosOrderDto, warehouseId: bigint): Promise<void> {
    const balances = await this.prisma.inventoryBalance.findMany({
      where: {
        warehouseId,
        productVariantId: { in: input.items.map((item) => toDatabaseId(item.productVariantId)) },
      },
      select: {
        productVariantId: true,
        onHand: true,
        reserved: true,
        productVariant: { select: { sku: true } },
      },
    });
    const byVariant = new Map(balances.map((row) => [row.productVariantId, row]));

    for (const item of input.items) {
      const balance = byVariant.get(toDatabaseId(item.productVariantId));
      const available = balance ? balance.onHand - balance.reserved : 0;
      if (available < item.quantity) {
        const sku = balance?.productVariant.sku ?? item.productVariantId;
        throw new ConflictException(
          `Kho quầy không đủ hàng cho ${sku}: còn ${available}, cần ${item.quantity}`,
        );
      }
    }
  }

  /**
   * Quầy bán là kho của chi nhánh nhân viên được phân quyền.
   *
   * Nhân viên thuộc một chi nhánh KHÔNG được bán từ kho chi nhánh khác — đó là lý do
   * không nhận `branchId` tự do từ client. Nhưng tài khoản phạm vi toàn hệ thống
   * (chủ cửa hàng) lại không gắn chi nhánh nào, nên với họ `branchId` là bắt buộc,
   * nếu không họ sẽ không đứng quầy được.
   */
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
      const cart = await transaction.cart.create({
        data: { customerId, branchId: warehouse.branchId, status: 'ACTIVE' },
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
          shippingMethod: POS_SHIPPING_METHOD,
          customerNote: input.note?.trim() || null,
          itemSubtotal,
          shippingTotal: new Prisma.Decimal(0),
          grandTotal: itemSubtotal,
          etaMinDays: 0,
          etaMaxDays: 0,
          // Khách nhận hàng tại quầy nên "người nhận" là chính khách, địa chỉ là
          // địa chỉ chi nhánh bán — trung thực hơn là bịa địa chỉ giao của khách.
          recipientSnapshot: {
            name: input.customer.name.trim(),
            phone: input.customer.phone.trim(),
            email: input.customer.email?.trim() ?? null,
            pickupAtBranch: branch.name,
            address: branch.addressJson,
          } as unknown as Prisma.InputJsonValue,
          shippingRuleSnapshot: {
            method: POS_SHIPPING_METHOD,
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
    await this.orders.confirmAdmin(
      placed.id,
      { expectedVersion: placed.version },
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
}
