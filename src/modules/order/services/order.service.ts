import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toDatabaseId, toEntityId } from '../../../common/identifiers/entity-id';
import { PrismaService } from '../../../database/prisma.service';
import type { AuthPrincipal } from '../../auth/auth.types';
import { AuditWriter } from '../../audit/audit.writer';
import { CartService } from '../../cart/cart.service';
import { CHECKOUT_ITEM_TYPE, CHECKOUT_STATUS, INVENTORY_RESERVATION_STATUS } from '../../checkout/checkout.constants';
import { ScopeType } from '../../iam/iam.types';
import {
  AdminOrderListDto,
  AdminOrderQueryDto,
  AdminOrderSummaryDto,
  OrderDetailDto,
  OrderRecipientDto,
} from '../dto/order.dto';
import {
  ORDER_AUDIT_ACTION,
  ORDER_CHANNEL,
  ORDER_FULFILLMENT_STATUS,
  ORDER_PAYMENT_STATUS,
  ORDER_STATUS,
  ORDER_STATUS_BY_GROUP,
} from '../order.constants';

type PlacementActor =
  | { type: 'GUEST'; cartId: bigint }
  | { type: 'CUSTOMER'; userId: string };

const orderInclude = {
  checkoutSession: { select: { paymentMethod: true, shippingMethod: true, cartId: true, cart: { select: { userId: true } } } },
  branch: { select: { name: true } },
  warehouse: { select: { name: true } },
  addresses: { orderBy: { id: 'asc' as const } },
  items: {
    orderBy: { lineNo: 'asc' as const },
    include: { components: { orderBy: { id: 'asc' as const } } },
  },
  statusHistory: { orderBy: { sequenceNo: 'asc' as const } },
} satisfies Prisma.OrderInclude;

type LoadedOrder = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly carts: CartService,
    private readonly audit: AuditWriter,
  ) {}

  async placeGuest(
    cartToken: string,
    checkoutToken: string,
    idempotencyKey: string,
    requestId: string,
  ): Promise<OrderDetailDto> {
    const cartId = await this.carts.resolveGuestCartIdForOrder(cartToken);
    return this.place(checkoutToken, idempotencyKey, requestId, { type: 'GUEST', cartId });
  }

  async placeAccount(
    userId: string,
    checkoutToken: string,
    idempotencyKey: string,
    requestId: string,
  ): Promise<OrderDetailDto> {
    return this.place(checkoutToken, idempotencyKey, requestId, { type: 'CUSTOMER', userId });
  }

  async listAdmin(query: AdminOrderQueryDto, principal: AuthPrincipal): Promise<AdminOrderListDto> {
    this.ensurePersistence();
    const where = this.adminWhere(query, principal);
    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: orderInclude,
        orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.order.count({ where }),
    ]);
    return { items: orders.map((order) => this.toSummary(order)), page: query.page, limit: query.limit, total };
  }

  async getAdmin(id: string, principal: AuthPrincipal): Promise<OrderDetailDto> {
    this.ensurePersistence();
    const order = await this.prisma.order.findFirst({
      where: { id: toDatabaseId(id), AND: [this.scopeWhere(principal)] },
      include: orderInclude,
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng trong phạm vi được phân quyền');
    return this.toDetail(order);
  }

  private async place(
    rawCheckoutToken: string,
    rawIdempotencyKey: string,
    requestId: string,
    actor: PlacementActor,
  ): Promise<OrderDetailDto> {
    this.ensurePersistence();
    const checkoutToken = rawCheckoutToken.trim();
    const idempotencyKey = rawIdempotencyKey.trim();
    if (!checkoutToken) throw new BadRequestException('Checkout token là bắt buộc');
    if (!idempotencyKey || idempotencyKey.length > 150) {
      throw new BadRequestException('Header Idempotency-Key hợp lệ là bắt buộc');
    }

    const preflight = await this.prisma.checkoutSession.findUnique({
      where: { checkoutToken },
      select: {
        id: true,
        customerId: true,
        cartId: true,
        cart: { select: { userId: true } },
        reservation: { select: { id: true } },
      },
    });
    if (!preflight?.reservation || !preflight.customerId) {
      throw new NotFoundException('Không tìm thấy checkout đã xác nhận để tạo đơn hàng');
    }
    this.assertPlacementOwnership(preflight.cartId, preflight.cart.userId, actor);
    const requestHash = this.hashPlacement(preflight.id, preflight.reservation.id, preflight.customerId);

    const replay = await this.prisma.order.findUnique({
      where: { idempotencyKey },
      include: orderInclude,
    });
    if (replay) {
      this.assertOrderOwnership(replay, actor);
      if (replay.requestHash !== requestHash) {
        throw new ConflictException('Idempotency-Key đã được dùng cho yêu cầu tạo đơn khác');
      }
      return this.toDetail(replay);
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (transaction) => {
          await transaction.$queryRaw(Prisma.sql`
            SELECT checkout.id
            FROM checkout_sessions checkout
            JOIN inventory_reservations reservation ON reservation.checkout_session_id = checkout.id
            WHERE checkout.checkout_token = ${checkoutToken}
            FOR UPDATE OF checkout, reservation
          `);
          const checkout = await transaction.checkoutSession.findUnique({
            where: { checkoutToken },
            include: {
              cart: { select: { userId: true } },
              reservation: true,
              order: { include: orderInclude },
              items: {
                orderBy: { createdAt: 'asc' },
                include: {
                  productVariant: {
                    include: {
                      product: {
                        include: {
                          media: {
                            where: { status: 'ACTIVE' },
                            orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
                            take: 1,
                            include: { mediaAsset: true },
                          },
                        },
                      },
                      bundleDefinition: {
                        include: { items: { include: { componentVariant: true } } },
                      },
                    },
                  },
                },
              },
            },
          });
          if (!checkout?.reservation || !checkout.customerId) {
            throw new NotFoundException('Không tìm thấy checkout đã xác nhận để tạo đơn hàng');
          }
          this.assertPlacementOwnership(checkout.cartId, checkout.cart.userId, actor);
          if (checkout.order) {
            if (checkout.order.idempotencyKey === idempotencyKey && checkout.order.requestHash === requestHash) {
              return this.toDetail(checkout.order);
            }
            throw new ConflictException('Checkout này đã tạo một đơn hàng khác');
          }
          const now = new Date();
          if (checkout.status !== CHECKOUT_STATUS.CONFIRMED) {
            throw new ConflictException('Checkout chưa ở trạng thái đã xác nhận');
          }
          if (
            checkout.reservation.status !== INVENTORY_RESERVATION_STATUS.ACTIVE ||
            checkout.reservation.expiresAt <= now
          ) {
            throw new ConflictException('Reservation đã hết hạn hoặc không còn hiệu lực');
          }
          if (checkout.items.length === 0) {
            throw new ConflictException('Checkout không có sản phẩm để tạo đơn hàng');
          }

          const sequence = await transaction.$queryRaw<Array<{ value: bigint }>>(Prisma.sql`
            SELECT nextval('public.order_number_seq')::bigint AS value
          `);
          const orderNo = this.orderNo(now, sequence[0]?.value);
          const recipient = this.readRecipient(checkout.recipientSnapshot);
          const created = await transaction.order.create({
            data: {
              orderNo,
              idempotencyKey,
              requestHash,
              checkoutSessionId: checkout.id,
              reservationId: checkout.reservation.id,
              customerId: checkout.customerId,
              branchId: checkout.branchId,
              warehouseId: checkout.warehouseId,
              channel: ORDER_CHANNEL.WEB,
              status: ORDER_STATUS.PENDING_CONFIRMATION,
              paymentStatus: ORDER_PAYMENT_STATUS.PENDING,
              fulfillmentStatus: ORDER_FULFILLMENT_STATUS.PENDING,
              currencyCode: checkout.currencyCode,
              pricesIncludeTax: checkout.pricesIncludeTax,
              subtotal: checkout.itemSubtotal,
              discountTotal: 0,
              shippingTotal: checkout.shippingTotal,
              taxTotal: 0,
              grandTotal: checkout.grandTotal,
              customerNote: checkout.customerNote,
              placedAt: now,
              addresses: { create: this.addressSnapshot(recipient) },
              items: {
                create: checkout.items.map((item, index) => ({
                  lineNo: index + 1,
                  productVariantId: item.productVariantId,
                  productBundleId: item.productVariant.bundleDefinition?.id,
                  itemType: item.itemType,
                  skuSnapshot: item.skuSnapshot,
                  productNameSnapshot: item.productVariant.product.name,
                  variantNameSnapshot: item.nameSnapshot,
                  imageUrlSnapshot: item.productVariant.product.media[0]?.mediaAsset.secureUrl,
                  quantity: item.quantity,
                  listUnitPrice: item.unitPrice,
                  discountAmount: 0,
                  finalUnitPrice: item.unitPrice,
                  taxAmount: 0,
                  lineTotal: item.lineTotal,
                  components: {
                    create: this.componentSnapshots(item),
                  },
                })),
              },
              statusHistory: {
                create: {
                  sequenceNo: 1,
                  toStatus: ORDER_STATUS.PENDING_CONFIRMATION,
                  actorType: actor.type,
                  actorId: actor.type === 'CUSTOMER' ? toDatabaseId(actor.userId) : null,
                  requestId,
                },
              },
            },
            include: orderInclude,
          });
          await transaction.checkoutSession.update({
            where: { id: checkout.id },
            data: { status: CHECKOUT_STATUS.COMPLETED, version: { increment: 1 } },
          });
          await transaction.cart.updateMany({
            where: { id: checkout.cartId, status: 'ACTIVE' },
            data: { status: 'CONVERTED', version: { increment: 1 } },
          });
          await this.audit.write({
            requestId,
            sequenceNo: 1,
            actorType: actor.type === 'GUEST' ? 'GUEST' : 'USER',
            actorUserId: actor.type === 'CUSTOMER' ? actor.userId : undefined,
            action: ORDER_AUDIT_ACTION.PLACE,
            entityType: 'ORDER',
            entityId: toEntityId(created.id),
            after: {
              orderNo: created.orderNo,
              status: created.status,
              branchId: toEntityId(created.branchId),
              grandTotal: created.grandTotal.toFixed(2),
            },
          }, transaction);
          return this.toDetail(created);
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (this.isSerializationConflict(error) && attempt < 2) continue;
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const raced = await this.prisma.order.findUnique({
            where: { checkoutSessionId: preflight.id },
            include: orderInclude,
          });
          if (raced?.idempotencyKey === idempotencyKey && raced.requestHash === requestHash) {
            this.assertOrderOwnership(raced, actor);
            return this.toDetail(raced);
          }
          throw new ConflictException('Checkout này đã tạo một đơn hàng khác');
        }
        throw error;
      }
    }
    throw new ServiceUnavailableException('Không thể tạo đơn do xung đột đồng thời; vui lòng thử lại');
  }

  private adminWhere(query: AdminOrderQueryDto, principal: AuthPrincipal): Prisma.OrderWhereInput {
    const filters: Prisma.OrderWhereInput[] = [this.scopeWhere(principal)];
    const statuses = query.statusGroup ? ORDER_STATUS_BY_GROUP[query.statusGroup] : undefined;
    if (statuses) filters.push({ status: { in: statuses } });
    if (query.search) {
      filters.push({
        OR: [
          { orderNo: { contains: query.search, mode: 'insensitive' } },
          { addresses: { some: { recipientName: { contains: query.search, mode: 'insensitive' } } } },
          { addresses: { some: { recipientPhone: { contains: query.search, mode: 'insensitive' } } } },
          { addresses: { some: { recipientEmail: { contains: query.search, mode: 'insensitive' } } } },
        ],
      });
    }
    return { AND: filters };
  }

  private scopeWhere(principal: AuthPrincipal): Prisma.OrderWhereInput {
    if (principal.scopes.some(({ type }) => type === ScopeType.GLOBAL)) return {};
    const branchIds = principal.scopes
      .filter((scope) => scope.type === ScopeType.BRANCH && scope.branchId)
      .map((scope) => toDatabaseId(scope.branchId!));
    if (branchIds.length === 0) throw new ForbiddenException('Tài khoản chưa được gán phạm vi chi nhánh');
    return { branchId: { in: branchIds } };
  }

  private assertPlacementOwnership(cartId: bigint, cartUserId: bigint | null, actor: PlacementActor): void {
    const owned = actor.type === 'GUEST'
      ? cartId === actor.cartId
      : cartUserId === toDatabaseId(actor.userId);
    if (!owned) throw new NotFoundException('Không tìm thấy checkout thuộc tài khoản hoặc giỏ hàng này');
  }

  private assertOrderOwnership(order: LoadedOrder, actor: PlacementActor): void {
    this.assertPlacementOwnership(order.checkoutSession.cartId, order.checkoutSession.cart.userId, actor);
  }

  private hashPlacement(checkoutId: bigint, reservationId: bigint, customerId: bigint): string {
    return createHash('sha256')
      .update(JSON.stringify({ checkoutId: toEntityId(checkoutId), reservationId: toEntityId(reservationId), customerId: toEntityId(customerId) }))
      .digest('hex');
  }

  private orderNo(now: Date, sequence: bigint | undefined): string {
    if (sequence === undefined) throw new ServiceUnavailableException('Không cấp được mã đơn hàng');
    const date = now.toISOString().slice(0, 10).replaceAll('-', '');
    return `ORD-${date}-${sequence.toString().padStart(8, '0')}`;
  }

  private readRecipient(value: Prisma.JsonValue): Record<string, unknown> {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      throw new ConflictException('Snapshot người nhận của checkout không hợp lệ');
    }
    return value as Record<string, unknown>;
  }

  private addressSnapshot(recipient: Record<string, unknown>) {
    const required = (key: string) => {
      const value = recipient[key];
      if (typeof value !== 'string' || !value.trim()) {
        throw new ConflictException(`Snapshot người nhận thiếu trường ${key}`);
      }
      return value.trim();
    };
    const optional = (key: string) => {
      const value = recipient[key];
      return typeof value === 'string' && value.trim() ? value.trim() : undefined;
    };
    return {
      addressType: 'SHIPPING',
      recipientName: required('recipient'),
      recipientPhone: required('phone'),
      recipientEmail: optional('email')?.toLowerCase(),
      addressLine: required('addressLine'),
      wardCode: optional('wardCode'),
      wardName: optional('ward'),
      districtCode: optional('districtCode'),
      districtName: optional('district'),
      provinceCode: required('provinceCode'),
      provinceName: required('province'),
      countryCode: 'VN',
    };
  }

  private componentSnapshots(item: {
    itemType: string;
    quantity: number;
    componentSnapshot: Prisma.JsonValue | null;
    productVariant: {
      bundleDefinition: null | {
        items: Array<{ id: bigint; componentVariantId: bigint; componentVariant: { sku: string; name: string } }>;
      };
    };
  }) {
    if (item.itemType !== CHECKOUT_ITEM_TYPE.BUNDLE) return [];
    if (!Array.isArray(item.componentSnapshot) || !item.productVariant.bundleDefinition) {
      throw new ConflictException('Snapshot thành phần combo không hợp lệ');
    }
    return item.componentSnapshot.map((raw) => {
      if (!raw || Array.isArray(raw) || typeof raw !== 'object') {
        throw new ConflictException('Snapshot thành phần combo không hợp lệ');
      }
      const value = raw as Record<string, unknown>;
      const productVariantId = typeof value.productVariantId === 'string'
        ? toDatabaseId(value.productVariantId)
        : 0n;
      const quantity = typeof value.quantity === 'number' && Number.isInteger(value.quantity)
        ? value.quantity
        : 0;
      const current = item.productVariant.bundleDefinition!.items.find(
        (candidate) => candidate.componentVariantId === productVariantId,
      );
      if (!current || quantity <= 0 || typeof value.sku !== 'string') {
        throw new ConflictException('Snapshot thành phần combo không còn khớp cấu hình đã xác nhận');
      }
      return {
        bundleItemId: current.id,
        componentVariantId: current.componentVariantId,
        skuSnapshot: value.sku,
        nameSnapshot: current.componentVariant.name,
        quantityPerBundle: quantity,
        totalQuantity: quantity * item.quantity,
      };
    });
  }

  private toSummary(order: LoadedOrder): AdminOrderSummaryDto {
    const address = order.addresses[0];
    if (!address) throw new ServiceUnavailableException('Đơn hàng thiếu snapshot địa chỉ nhận hàng');
    return {
      id: toEntityId(order.id),
      orderNo: order.orderNo,
      status: order.status,
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      paymentMethod: order.checkoutSession.paymentMethod,
      shippingMethod: order.checkoutSession.shippingMethod,
      branchId: toEntityId(order.branchId),
      branchName: order.branch.name,
      warehouseName: order.warehouse.name,
      grandTotal: order.grandTotal.toFixed(2),
      itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      recipient: this.toRecipient(address),
      placedAt: order.placedAt.toISOString(),
      version: Number(order.version),
    };
  }

  private toDetail(order: LoadedOrder): OrderDetailDto {
    return {
      ...this.toSummary(order),
      currencyCode: order.currencyCode,
      pricesIncludeTax: order.pricesIncludeTax,
      subtotal: order.subtotal.toFixed(2),
      discountTotal: order.discountTotal.toFixed(2),
      shippingTotal: order.shippingTotal.toFixed(2),
      taxTotal: order.taxTotal.toFixed(2),
      customerNote: order.customerNote,
      items: order.items.map((item) => ({
        id: toEntityId(item.id),
        lineNo: item.lineNo,
        itemType: item.itemType,
        sku: item.skuSnapshot,
        productName: item.productNameSnapshot,
        variantName: item.variantNameSnapshot,
        imageUrl: item.imageUrlSnapshot,
        quantity: item.quantity,
        unitPrice: item.finalUnitPrice.toFixed(2),
        lineTotal: item.lineTotal.toFixed(2),
        components: item.components.map((component) => ({
          productVariantId: toEntityId(component.componentVariantId),
          sku: component.skuSnapshot,
          name: component.nameSnapshot,
          quantityPerBundle: component.quantityPerBundle,
          totalQuantity: component.totalQuantity,
        })),
      })),
      statusHistory: order.statusHistory.map((history) => ({
        sequenceNo: history.sequenceNo,
        fromStatus: history.fromStatus,
        toStatus: history.toStatus,
        reason: history.reason,
        actorType: history.actorType,
        createdAt: history.createdAt.toISOString(),
      })),
    };
  }

  private toRecipient(address: {
    recipientName: string;
    recipientPhone: string;
    recipientEmail: string | null;
    addressLine: string;
    wardName: string | null;
    districtName: string | null;
    provinceName: string;
  }): OrderRecipientDto {
    return {
      name: address.recipientName,
      phone: address.recipientPhone,
      email: address.recipientEmail,
      addressLine: address.addressLine,
      ward: address.wardName,
      district: address.districtName,
      province: address.provinceName,
    };
  }

  private isSerializationConflict(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
    if (error.code === 'P2034') return true;
    const databaseCode = error.meta?.code;
    return error.code === 'P2010' &&
      (typeof databaseCode === 'string' || typeof databaseCode === 'number') &&
      String(databaseCode).toUpperCase() === '40001';
  }

  private ensurePersistence(): void {
    if (!this.prisma.isEnabled()) {
      throw new ServiceUnavailableException('Chưa bật lưu trữ PostgreSQL cho đơn hàng');
    }
  }
}
