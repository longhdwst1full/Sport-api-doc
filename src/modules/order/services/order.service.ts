import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { toDatabaseId, toEntityId } from '../../../common/identifiers/entity-id';
import { PrismaService } from '../../../database/prisma.service';
import type { AuthPrincipal } from '../../auth/auth.types';
import { AuditWriter } from '../../audit/audit.writer';
import { CartService } from '../../cart/cart.service';
import { CHECKOUT_ITEM_TYPE, CHECKOUT_STATUS, INVENTORY_RESERVATION_STATUS } from '../../checkout/checkout.constants';
import { ScopeType } from '../../iam/iam.types';
import {
  AccountOrderListDto,
  AccountOrderQueryDto,
  AdminOrderListDto,
  AdminOrderQueryDto,
  AdminOrderSummaryDto,
  CompleteOrderCommandDto,
  ConfirmOrderCommandDto,
  GuestOrderPlacementDto,
  OrderCancelCommandDto,
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
  ORDER_TRANSACTION,
  ORDER_TRANSITION,
} from '../order.constants';

type PlacementActor =
  | { type: 'GUEST'; cartId: bigint }
  | { type: 'CUSTOMER'; userId: string };

type TransitionActor = PlacementActor | { type: 'ADMIN'; principal: AuthPrincipal };

interface TransitionIdempotency {
  key: string;
  hash: string;
}

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

const orderSummaryInclude = {
  checkoutSession: { select: { paymentMethod: true, shippingMethod: true } },
  branch: { select: { name: true } },
  warehouse: { select: { name: true } },
  addresses: { orderBy: { id: 'asc' as const }, take: 1 },
  items: { select: { quantity: true } },
} satisfies Prisma.OrderInclude;

type LoadedOrder = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
type LoadedOrderSummary = Prisma.OrderGetPayload<{ include: typeof orderSummaryInclude }>;

@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly carts: CartService,
    private readonly audit: AuditWriter,
    private readonly config: ConfigService,
  ) {}

  async placeGuest(
    cartToken: string,
    checkoutToken: string,
    idempotencyKey: string,
    requestId: string,
  ): Promise<GuestOrderPlacementDto> {
    const cartId = await this.carts.resolveGuestCartIdForOrder(cartToken);
    const order = await this.place(checkoutToken, idempotencyKey, requestId, { type: 'GUEST', cartId });
    // SECURITY: Guest cart token đã được DB lưu dạng SHA-256 và một cart chỉ tạo một Order.
    // Tái sử dụng token này giúp retry placement vẫn trả đúng credential, không lưu token Order dạng rõ.
    return { ...order, guestAccessToken: cartToken.trim() };
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
        // PERFORMANCE: List chỉ đọc projection phục vụ summary; item component và
        // toàn bộ status history được giữ riêng cho endpoint detail.
        include: orderSummaryInclude,
        orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.order.count({ where }),
    ]);
    return { items: orders.map((order) => this.toSummary(order)), page: query.page, limit: query.limit, total };
  }

  async confirmAdmin(
    id: string,
    command: ConfirmOrderCommandDto,
    idempotencyKey: string,
    requestId: string,
    principal: AuthPrincipal,
  ): Promise<OrderDetailDto> {
    this.ensurePersistence();
    const orderId = toDatabaseId(id);
    const actor: TransitionActor = { type: 'ADMIN', principal };
    const preflight = await this.prisma.order.findFirst({
      where: { id: orderId, AND: [this.scopeWhere(principal)] },
      include: orderInclude,
    });
    if (!preflight) throw new NotFoundException('Không tìm thấy đơn hàng trong phạm vi được phân quyền');
    const idempotency = this.transitionIdempotency(
      idempotencyKey,
      ORDER_TRANSITION.CONFIRM,
      orderId,
      command.expectedVersion,
      command.note ?? '',
    );
    const replay = this.transitionReplay(preflight, idempotency.key, idempotency.hash, ORDER_STATUS.CONFIRMED);
    if (replay) return this.toDetail(preflight);

    return this.withSerializationRetry(async () => this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`);
      const locked = await transaction.order.findUnique({
        where: { id: orderId },
        include: { ...orderInclude, payment: true, reservation: true },
      });
      if (!locked) throw new NotFoundException('Không tìm thấy đơn hàng');
      this.assertTransitionOwnership(locked, actor);
      if (this.transitionReplay(locked, idempotency.key, idempotency.hash, ORDER_STATUS.CONFIRMED)) {
        return this.toDetail(locked);
      }
      if (Number(locked.version) !== command.expectedVersion) {
        throw new ConflictException('Đơn hàng đã thay đổi; vui lòng tải lại trước khi xác nhận');
      }
      if (locked.status !== ORDER_STATUS.PENDING_CONFIRMATION || locked.fulfillmentStatus !== ORDER_FULFILLMENT_STATUS.PENDING) {
        throw new ConflictException('Chỉ được xác nhận đơn đang chờ xử lý');
      }
      if (!locked.payment) throw new ConflictException('Đơn hàng chưa có thông tin thanh toán');
      if (locked.checkoutSession.paymentMethod === 'BANK_TRANSFER' && locked.payment.status !== ORDER_PAYMENT_STATUS.SUCCESS) {
        throw new ConflictException('Đơn chuyển khoản chỉ được xác nhận sau khi đã nhận đủ tiền');
      }
      if (locked.reservation.status !== INVENTORY_RESERVATION_STATUS.ACTIVE) {
        throw new ConflictException('Giữ chỗ tồn kho của đơn không còn hiệu lực');
      }
      const updated = await transaction.order.update({
        where: { id: orderId },
        data: {
          status: ORDER_STATUS.CONFIRMED,
          version: { increment: 1 },
          statusHistory: {
            create: this.statusHistoryInput(locked, ORDER_STATUS.CONFIRMED, command.note ?? '', idempotency, requestId, actor),
          },
        },
        include: orderInclude,
      });
      await this.audit.write({
        requestId,
        sequenceNo: 1,
        actorType: 'USER',
        actorUserId: principal.userId,
        action: ORDER_AUDIT_ACTION.CONFIRM,
        entityType: 'ORDER',
        entityId: toEntityId(orderId),
        before: { status: locked.status },
        after: { status: updated.status },
        reason: command.note,
      }, transaction);
      return this.toDetail(updated);
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: ORDER_TRANSACTION.MAX_WAIT_MS,
      timeout: ORDER_TRANSACTION.TIMEOUT_MS,
    }));
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

  async listAccount(userId: string, query: AccountOrderQueryDto): Promise<AccountOrderListDto> {
    this.ensurePersistence();
    const where: Prisma.OrderWhereInput = {
      checkoutSession: { cart: { userId: toDatabaseId(userId) } },
    };
    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: orderSummaryInclude,
        orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.order.count({ where }),
    ]);
    return { items: orders.map((order) => this.toSummary(order)), page: query.page, limit: query.limit, total };
  }

  async getGuest(cartToken: string, orderNo: string): Promise<OrderDetailDto> {
    this.ensurePersistence();
    const cartId = await this.carts.resolveGuestCartIdForOrder(cartToken);
    const order = await this.findOwnedOrder(orderNo, { type: 'GUEST', cartId });
    return this.toDetail(order);
  }

  async getAccount(userId: string, orderNo: string): Promise<OrderDetailDto> {
    this.ensurePersistence();
    const order = await this.findOwnedOrder(orderNo, { type: 'CUSTOMER', userId });
    return this.toDetail(order);
  }

  async cancelGuest(
    cartToken: string,
    orderNo: string,
    command: OrderCancelCommandDto,
    idempotencyKey: string,
    requestId: string,
  ): Promise<OrderDetailDto> {
    const cartId = await this.carts.resolveGuestCartIdForOrder(cartToken);
    const order = await this.findOwnedOrder(orderNo, { type: 'GUEST', cartId });
    return this.cancel(order.id, command, idempotencyKey, requestId, { type: 'GUEST', cartId });
  }

  async cancelAccount(
    userId: string,
    orderNo: string,
    command: OrderCancelCommandDto,
    idempotencyKey: string,
    requestId: string,
  ): Promise<OrderDetailDto> {
    const actor: TransitionActor = { type: 'CUSTOMER', userId };
    const order = await this.findOwnedOrder(orderNo, actor);
    return this.cancel(order.id, command, idempotencyKey, requestId, actor);
  }

  async cancelAdmin(
    id: string,
    command: OrderCancelCommandDto,
    idempotencyKey: string,
    requestId: string,
    principal: AuthPrincipal,
  ): Promise<OrderDetailDto> {
    this.ensurePersistence();
    const order = await this.prisma.order.findFirst({
      where: { id: toDatabaseId(id), AND: [this.scopeWhere(principal)] },
      include: orderInclude,
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng trong phạm vi được phân quyền');
    return this.cancel(order.id, command, idempotencyKey, requestId, { type: 'ADMIN', principal });
  }

  async completeAdmin(
    id: string,
    command: CompleteOrderCommandDto,
    idempotencyKey: string,
    requestId: string,
    principal: AuthPrincipal,
  ): Promise<OrderDetailDto> {
    this.ensurePersistence();
    const orderId = toDatabaseId(id);
    const actor: TransitionActor = { type: 'ADMIN', principal };
    const preflight = await this.prisma.order.findFirst({
      where: { id: orderId, AND: [this.scopeWhere(principal)] },
      include: orderInclude,
    });
    if (!preflight) throw new NotFoundException('Không tìm thấy đơn hàng trong phạm vi được phân quyền');
    const idempotency = this.transitionIdempotency(
      idempotencyKey,
      ORDER_TRANSITION.COMPLETE_MANUALLY,
      orderId,
      command.expectedVersion,
      command.reason,
    );
    const replay = this.transitionReplay(preflight, idempotency.key, idempotency.hash, ORDER_STATUS.COMPLETED);
    if (replay) return this.toDetail(preflight);

    return this.withSerializationRetry(async () =>
      this.prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw(Prisma.sql`
          SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE
        `);
        const locked = await transaction.order.findUnique({ where: { id: orderId }, include: orderInclude });
        if (!locked) throw new NotFoundException('Không tìm thấy đơn hàng');
        this.assertTransitionOwnership(locked, actor);
        if (this.transitionReplay(locked, idempotency.key, idempotency.hash, ORDER_STATUS.COMPLETED)) {
          return this.toDetail(locked);
        }
        if (Number(locked.version) !== command.expectedVersion) {
          throw new ConflictException('Đơn hàng đã thay đổi; vui lòng tải lại trước khi hoàn tất');
        }
        if (
          locked.status !== ORDER_STATUS.DELIVERED ||
          locked.fulfillmentStatus !== ORDER_FULFILLMENT_STATUS.DELIVERED ||
          locked.paymentStatus !== ORDER_PAYMENT_STATUS.SUCCESS
        ) {
          throw new ConflictException('Chỉ được hoàn tất đơn đã giao đủ hàng và đã thu đủ tiền');
        }
        const now = new Date();
        const updated = await transaction.order.update({
          where: { id: orderId },
          data: {
            status: ORDER_STATUS.COMPLETED,
            completedAt: now,
            version: { increment: 1 },
            statusHistory: { create: this.statusHistoryInput(locked, ORDER_STATUS.COMPLETED, command.reason, idempotency, requestId, actor) },
          },
          include: orderInclude,
        });
        await this.audit.write({
          requestId,
          sequenceNo: 1,
          actorType: 'USER',
          actorUserId: principal.userId,
          action: ORDER_AUDIT_ACTION.COMPLETE_MANUALLY,
          entityType: 'ORDER',
          entityId: toEntityId(orderId),
          before: { status: locked.status },
          after: { status: updated.status, completedAt: now.toISOString() },
          reason: command.reason,
        }, transaction);
        return this.toDetail(updated);
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: ORDER_TRANSACTION.MAX_WAIT_MS,
        timeout: ORDER_TRANSACTION.TIMEOUT_MS,
      }),
    );
  }

  private async findOwnedOrder(orderNo: string, actor: PlacementActor): Promise<LoadedOrder> {
    const normalizedOrderNo = orderNo.trim().toUpperCase();
    if (!normalizedOrderNo) throw new BadRequestException('Mã đơn hàng là bắt buộc');
    const ownership: Prisma.OrderWhereInput = actor.type === 'GUEST'
      ? { checkoutSession: { cartId: actor.cartId } }
      : { checkoutSession: { cart: { userId: toDatabaseId(actor.userId) } } };
    const order = await this.prisma.order.findFirst({
      where: { orderNo: normalizedOrderNo, AND: [ownership] },
      include: orderInclude,
    });
    // SECURITY: Trả 404 thống nhất để không tiết lộ mã đơn có tồn tại nhưng thuộc người khác.
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng thuộc tài khoản hoặc token này');
    return order;
  }

  private async cancel(
    orderId: bigint,
    command: OrderCancelCommandDto,
    rawIdempotencyKey: string,
    requestId: string,
    actor: TransitionActor,
  ): Promise<OrderDetailDto> {
    this.ensurePersistence();
    const idempotency = this.transitionIdempotency(
      rawIdempotencyKey,
      ORDER_TRANSITION.CANCEL,
      orderId,
      command.expectedVersion,
      command.reason,
    );
    const preflight = await this.prisma.order.findUnique({ where: { id: orderId }, include: orderInclude });
    if (!preflight) throw new NotFoundException('Không tìm thấy đơn hàng');
    this.assertTransitionOwnership(preflight, actor);
    if (this.transitionReplay(preflight, idempotency.key, idempotency.hash, ORDER_STATUS.CANCELLED)) {
      return this.toDetail(preflight);
    }

    return this.withSerializationRetry(async () =>
      this.prisma.$transaction(async (transaction) => {
        // TRANSACTION: Khóa Order → Reservation → các balance theo variant để cancellation
        // không thể chạy lệch với ship/expiry hoặc một cancellation đồng thời.
        await transaction.$queryRaw(Prisma.sql`
          SELECT placed_order.id
          FROM orders placed_order
          JOIN inventory_reservations reservation ON reservation.id = placed_order.reservation_id
          WHERE placed_order.id = ${orderId}
          FOR UPDATE OF placed_order, reservation
        `);
        const locked = await transaction.order.findUnique({ where: { id: orderId }, include: orderInclude });
        if (!locked) throw new NotFoundException('Không tìm thấy đơn hàng');
        this.assertTransitionOwnership(locked, actor);
        if (this.transitionReplay(locked, idempotency.key, idempotency.hash, ORDER_STATUS.CANCELLED)) {
          return this.toDetail(locked);
        }
        if (Number(locked.version) !== command.expectedVersion) {
          throw new ConflictException('Đơn hàng đã thay đổi; vui lòng tải lại trước khi hủy');
        }
        if (
          locked.status !== ORDER_STATUS.PENDING_CONFIRMATION ||
          ![ORDER_PAYMENT_STATUS.PENDING, ORDER_PAYMENT_STATUS.FAILED].includes(locked.paymentStatus as never) ||
          locked.fulfillmentStatus !== ORDER_FULFILLMENT_STATUS.PENDING
        ) {
          throw new ConflictException('Chỉ được hủy đơn chưa thanh toán và chưa bắt đầu xử lý');
        }
        const reservation = await transaction.inventoryReservation.findUnique({
          where: { id: locked.reservationId },
          include: { items: true },
        });
        if (!reservation || reservation.status !== INVENTORY_RESERVATION_STATUS.ACTIVE) {
          throw new ConflictException('Reservation của đơn không còn ở trạng thái có thể giải phóng');
        }
        const variantIds = reservation.items
          .map(({ productVariantId }) => productVariantId)
          .sort((left, right) => left < right ? -1 : 1);
        if (variantIds.length === 0) {
          throw new ServiceUnavailableException('Reservation của đơn không có dòng tồn kho');
        }
        await transaction.$queryRaw(Prisma.sql`
          SELECT id FROM inventory_balances
          WHERE warehouse_id = ${reservation.warehouseId}
            AND product_variant_id IN (${Prisma.join(variantIds)})
          ORDER BY product_variant_id
          FOR UPDATE
        `);
        const balances = await transaction.inventoryBalance.findMany({
          where: { warehouseId: reservation.warehouseId, productVariantId: { in: variantIds } },
        });
        const balanceByVariant = new Map(balances.map((balance) => [balance.productVariantId, balance]));
        for (const item of reservation.items) {
          const balance = balanceByVariant.get(item.productVariantId);
          if (!balance || balance.reserved < item.quantity) {
            throw new ServiceUnavailableException('Số lượng giữ chỗ trong kho không nhất quán');
          }
          const changed = await transaction.inventoryBalance.updateMany({
            where: { id: balance.id, version: balance.version },
            data: { reserved: { decrement: item.quantity }, version: { increment: 1 } },
          });
          if (changed.count !== 1) {
            throw new ConflictException('Tồn kho vừa thay đổi; vui lòng tải lại và hủy đơn lần nữa');
          }
        }
        const now = new Date();
        await transaction.inventoryReservation.update({
          where: { id: reservation.id },
          data: {
            status: INVENTORY_RESERVATION_STATUS.RELEASED,
            releasedAt: now,
            releaseReason: command.reason,
            version: { increment: 1 },
          },
        });
        const payment = await transaction.payment.findUnique({ where: { orderId } });
        if (payment) {
          await transaction.payment.update({
            where: { id: payment.id },
            data: {
              status: ORDER_PAYMENT_STATUS.CANCELLED,
              failureReason: command.reason,
              version: { increment: 1 },
            },
          });
          await transaction.paymentTransaction.create({
            data: {
              paymentId: payment.id,
              transactionType: 'CANCELLED',
              provider: payment.method === 'COD' ? 'INTERNAL_COD' : 'MANUAL_BANK_TRANSFER',
              idempotencyKey: `payment-cancel:${idempotency.hash}`,
              requestHash: idempotency.hash,
              amount: 0,
              currencyCode: payment.currencyCode,
              status: ORDER_PAYMENT_STATUS.CANCELLED,
              rawPayloadRedacted: { reason: command.reason },
              occurredAt: now,
            },
          });
        }
        const updated = await transaction.order.update({
          where: { id: orderId },
          data: {
            status: ORDER_STATUS.CANCELLED,
            paymentStatus: ORDER_PAYMENT_STATUS.CANCELLED,
            cancelledAt: now,
            cancelReason: command.reason,
            version: { increment: 1 },
            statusHistory: { create: this.statusHistoryInput(locked, ORDER_STATUS.CANCELLED, command.reason, idempotency, requestId, actor) },
          },
          include: orderInclude,
        });
        const actorUserId = actor.type === 'GUEST'
          ? undefined
          : actor.type === 'CUSTOMER'
            ? actor.userId
            : actor.principal.userId;
        await this.audit.write({
          requestId,
          sequenceNo: 1,
          actorType: actor.type === 'GUEST' ? 'GUEST' : 'USER',
          actorUserId,
          action: ORDER_AUDIT_ACTION.CANCEL,
          entityType: 'ORDER',
          entityId: toEntityId(orderId),
          before: { status: locked.status, reservationStatus: reservation.status },
          after: { status: updated.status, reservationStatus: INVENTORY_RESERVATION_STATUS.RELEASED },
          reason: command.reason,
        }, transaction);
        return this.toDetail(updated);
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: ORDER_TRANSACTION.MAX_WAIT_MS,
        timeout: ORDER_TRANSACTION.TIMEOUT_MS,
      }),
    );
  }

  private assertTransitionOwnership(order: LoadedOrder, actor: TransitionActor): void {
    if (actor.type !== 'ADMIN') {
      this.assertOrderOwnership(order, actor);
      return;
    }
    if (actor.principal.scopes.some(({ type }) => type === ScopeType.GLOBAL)) return;
    const allowed = actor.principal.scopes.some(
      (scope) => scope.type === ScopeType.BRANCH && scope.branchId && toDatabaseId(scope.branchId) === order.branchId,
    );
    if (!allowed) throw new ForbiddenException('Đơn hàng không thuộc phạm vi chi nhánh được phân quyền');
  }

  private transitionIdempotency(
    rawKey: string,
    transition: string,
    orderId: bigint,
    expectedVersion: number,
    reason: string,
  ): TransitionIdempotency {
    const key = rawKey.trim();
    if (!key || key.length > 150) {
      throw new BadRequestException('Header Idempotency-Key hợp lệ là bắt buộc');
    }
    // IDEMPOTENCY: expectedVersion là một phần intent. Cùng key nhưng client gửi
    // một snapshot version khác phải conflict thay vì bị coi là replay hợp lệ.
    const hash = createHash('sha256')
      .update(JSON.stringify({
        transition,
        orderId: toEntityId(orderId),
        expectedVersion,
        reason: reason.trim(),
      }))
      .digest('hex');
    return { key, hash };
  }

  private transitionReplay(
    order: LoadedOrder,
    key: string,
    hash: string,
    targetStatus: string,
  ): boolean {
    const replay = order.statusHistory.find((history) => history.idempotencyKey === key);
    if (!replay) return false;
    if (replay.requestHash !== hash || replay.toStatus !== targetStatus) {
      throw new ConflictException('Idempotency-Key đã được dùng cho thao tác đơn hàng khác');
    }
    return true;
  }

  private statusHistoryInput(
    order: LoadedOrder,
    toStatus: string,
    reason: string,
    idempotency: TransitionIdempotency,
    requestId: string,
    actor: TransitionActor,
  ): Prisma.OrderStatusHistoryUncheckedCreateWithoutOrderInput {
    const actorUserId = actor.type === 'GUEST'
      ? null
      : toDatabaseId(actor.type === 'CUSTOMER' ? actor.userId : actor.principal.userId);
    const latestSequence = order.statusHistory.reduce(
      (highest, history) => Math.max(highest, history.sequenceNo),
      0,
    );
    return {
      sequenceNo: latestSequence + 1,
      fromStatus: order.status,
      toStatus,
      reason,
      // Domain actor ADMIN is persisted as USER; ADMIN describes the command
      // channel, while the shared audit/history schema classifies human actors as USER.
      actorType: actor.type === 'ADMIN' ? 'USER' : actor.type,
      actorId: actorUserId,
      requestId,
      idempotencyKey: idempotency.key,
      requestHash: idempotency.hash,
    };
  }

  private async withSerializationRetry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (this.isSerializationConflict(error) && attempt < 2) continue;
        if (this.isSerializationConflict(error)) {
          throw new ConflictException('Đơn hàng vừa được xử lý đồng thời; vui lòng tải lại và thử lại');
        }
        throw error;
      }
    }
    throw new ServiceUnavailableException('Không thể xử lý đơn hàng do xung đột đồng thời');
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
          const paymentTimeoutMinutes = this.config.get<number>('app.payment.timeoutMinutes') ?? 30;
          const paymentExpiresAt = checkout.paymentMethod === 'BANK_TRANSFER'
            ? new Date(now.getTime() + paymentTimeoutMinutes * 60_000)
            : null;
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
                  idempotencyKey,
                  requestHash,
                },
              },
              payment: {
                create: {
                  paymentRef: `PAY-${orderNo}`,
                  method: checkout.paymentMethod,
                  status: ORDER_PAYMENT_STATUS.PENDING,
                  expectedAmount: checkout.grandTotal,
                  receivedAmount: 0,
                  currencyCode: checkout.currencyCode,
                  expiresAt: paymentExpiresAt,
                  transactions: {
                    create: {
                      transactionType: 'CREATED',
                      provider: checkout.paymentMethod === 'COD' ? 'INTERNAL_COD' : 'MANUAL_BANK_TRANSFER',
                      idempotencyKey,
                      requestHash,
                      amount: checkout.grandTotal,
                      currencyCode: checkout.currencyCode,
                      status: ORDER_PAYMENT_STATUS.PENDING,
                      occurredAt: now,
                    },
                  },
                },
              },
              fulfillment: {
                create: {
                  fulfillmentNo: `FUL-${orderNo}`,
                  warehouseId: checkout.warehouseId,
                  status: ORDER_FULFILLMENT_STATUS.PENDING,
                  history: {
                    create: {
                      sequenceNo: 1,
                      toStatus: ORDER_FULFILLMENT_STATUS.PENDING,
                      requestId,
                    },
                  },
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
        }, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: ORDER_TRANSACTION.MAX_WAIT_MS,
          timeout: ORDER_TRANSACTION.TIMEOUT_MS,
        });
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

  private toSummary(order: LoadedOrder | LoadedOrderSummary): AdminOrderSummaryDto {
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
