import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toDatabaseId, toEntityId } from '../../../common/identifiers/entity-id';
import {
  PartnerPickupPoint,
  PartnerShipmentResult,
  ShippingPartnerClient,
} from '../../../integrations/shipping-partner/shipping-partner.client';
import { PrismaService } from '../../../database/prisma.service';
import type { AuthPrincipal } from '../../auth/auth.types';
import { AuditWriter } from '../../audit/audit.writer';
import { INVENTORY_RESERVATION_STATUS } from '../../checkout/checkout.constants';
import { ScopeType } from '../../iam/iam.types';
import { INVENTORY_MOVEMENT_TYPE, INVENTORY_REFERENCE_TYPE } from '../../inventory/inventory.constants';
import { ORDER_FULFILLMENT_STATUS, ORDER_PAYMENT_STATUS, ORDER_STATUS } from '../../order/order.constants';
import { PAYMENT_METHOD } from '../../payment/payment.constants';
import {
  AdminFulfillmentListDto,
  AdminFulfillmentQueryDto,
  FailDeliveryDto,
  FulfillmentDetailDto,
  FulfillmentTransitionDto,
  FulfillmentLabelDto,
  ReceiveReturnDto,
  ShipFulfillmentDto,
} from '../dto/fulfillment.dto';
import { OutboxWriter } from '../../notification/outbox.writer';
import { OUTBOX_EVENT_TYPE } from '../../notification/notification.constants';
import {
  FULFILLMENT_ACTION,
  FULFILLMENT_STATUS,
  FULFILLMENT_TRANSACTION,
  RETURN_CONDITION,
} from '../fulfillment.constants';

/** Khối lượng quy ước cho mỗi sản phẩm khi kiện hàng chưa được cân thật. */
const DEFAULT_ITEM_WEIGHT_GRAMS = 500;

/**
 * Trạng thái đáng gửi email cho khách.
 *
 * `PICKING` và `PACKED` là việc nội bộ của kho: khách không làm gì với thông tin đó, còn hộp thư
 * của họ thì đầy thêm bốn email cho mỗi đơn.
 */
const CUSTOMER_VISIBLE_FULFILLMENT_STATUSES = new Set<string>([
  FULFILLMENT_STATUS.SHIPPED,
  FULFILLMENT_STATUS.DELIVERED,
  FULFILLMENT_STATUS.DELIVERY_FAILED,
]);

const fulfillmentInclude = {
  warehouse: {
    select: { name: true, branchId: true, branch: { select: { addressJson: true } } },
  },
  order: {
    include: {
      addresses: { orderBy: { id: 'asc' as const }, take: 1 },
      checkoutSession: { select: { paymentMethod: true } },
      payment: { select: { status: true } },
      reservation: { include: { items: { orderBy: { productVariantId: 'asc' as const } } } },
      statusHistory: { orderBy: { sequenceNo: 'asc' as const } },
    },
  },
  history: { orderBy: { sequenceNo: 'asc' as const } },
} satisfies Prisma.FulfillmentInclude;

const fulfillmentSummaryInclude = {
  warehouse: { select: { name: true } },
  order: { include: { addresses: { orderBy: { id: 'asc' as const }, take: 1 } } },
} satisfies Prisma.FulfillmentInclude;

type LoadedFulfillment = Prisma.FulfillmentGetPayload<{ include: typeof fulfillmentInclude }>;
type LoadedFulfillmentSummary = Prisma.FulfillmentGetPayload<{ include: typeof fulfillmentSummaryInclude }>;

interface TransitionIntent {
  key: string;
  hash: string;
}

@Injectable()
export class FulfillmentService {
  private readonly logger = new Logger(FulfillmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
    private readonly shippingPartner: ShippingPartnerClient,
    private readonly outbox: OutboxWriter,
  ) {}

  async list(query: AdminFulfillmentQueryDto, principal: AuthPrincipal): Promise<AdminFulfillmentListDto> {
    this.ensurePersistence();
    const where = this.queryWhere(query, principal);
    const [items, total] = await Promise.all([
      this.prisma.fulfillment.findMany({
        where,
        include: fulfillmentSummaryInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.fulfillment.count({ where }),
    ]);
    return { items: items.map((item) => this.toSummary(item)), page: query.page, limit: query.limit, total };
  }

  async get(id: string, principal: AuthPrincipal): Promise<FulfillmentDetailDto> {
    this.ensurePersistence();
    const fulfillment = await this.prisma.fulfillment.findFirst({
      where: { id: toDatabaseId(id), AND: [this.scopeWhere(principal)] },
      include: fulfillmentInclude,
    });
    if (!fulfillment) throw new NotFoundException('Không tìm thấy giao vận trong phạm vi được phân quyền');
    return this.toDetail(fulfillment);
  }

  async getByOrder(orderId: string, principal: AuthPrincipal): Promise<FulfillmentDetailDto> {
    this.ensurePersistence();
    const fulfillment = await this.prisma.fulfillment.findFirst({
      where: { orderId: toDatabaseId(orderId), AND: [this.scopeWhere(principal)] },
      include: fulfillmentInclude,
    });
    if (!fulfillment) throw new NotFoundException('Không tìm thấy giao vận của đơn hàng trong phạm vi được phân quyền');
    return this.toDetail(fulfillment);
  }

  pick(id: string, input: FulfillmentTransitionDto, key: string, requestId: string, principal: AuthPrincipal) {
    return this.simpleTransition(id, input, key, requestId, principal, FULFILLMENT_ACTION.PICK);
  }

  pack(id: string, input: FulfillmentTransitionDto, key: string, requestId: string, principal: AuthPrincipal) {
    return this.simpleTransition(id, input, key, requestId, principal, FULFILLMENT_ACTION.PACK);
  }

  deliver(id: string, input: FulfillmentTransitionDto, key: string, requestId: string, principal: AuthPrincipal) {
    return this.simpleTransition(id, input, key, requestId, principal, FULFILLMENT_ACTION.DELIVER);
  }

  async ship(
    id: string,
    input: ShipFulfillmentDto,
    key: string,
    requestId: string,
    principal: AuthPrincipal,
  ): Promise<FulfillmentDetailDto> {
    this.ensurePersistence();
    const fulfillmentId = toDatabaseId(id);
    const intent = this.intent(key, FULFILLMENT_ACTION.SHIP, id, input);
    // PROVIDER: vận đơn phải tạo NGOÀI transaction. Gọi HTTP bên trong sẽ giữ khoá tồn kho suốt
    // vòng mạng, và mỗi lần serializable retry sẽ tạo thêm một vận đơn trùng ở hãng giao hàng.
    const partnerShipment = await this.createPartnerShipment(fulfillmentId, input, intent, principal);
    const carrierCode = input.carrierCode?.trim() || partnerShipment?.provider || null;
    const trackingNo = input.trackingNo?.trim() || partnerShipment?.trackingCode || null;
    try {
      return await this.shipWithinTransaction(
        fulfillmentId,
        input,
        intent,
        requestId,
        principal,
        carrierCode,
        trackingNo,
      );
    } catch (error) {
      // TRANSACTION: transaction thất bại nhưng vận đơn đã nằm ở hãng. Phải huỷ bù, nếu không
      // shipper vẫn tới lấy một kiện hàng mà hệ thống coi như chưa xuất kho.
      if (partnerShipment) {
        await this.cancelPartnerShipment(partnerShipment.trackingCode, 'Xuất kho thất bại');
      }
      throw error;
    }
  }

  /**
   * Tạo vận đơn ở hãng giao hàng trước khi mở transaction.
   *
   * IDEMPOTENCY: chỉ tạo khi lệnh này chưa từng chạy (`replay` rỗng) và Admin không tự nhập mã
   * vận đơn. `client_order_code` gửi lên là `orderNo`, nên hãng cũng từ chối trùng ở phía họ.
   */
  private async createPartnerShipment(
    fulfillmentId: bigint,
    input: ShipFulfillmentDto,
    intent: TransitionIntent,
    principal: AuthPrincipal,
  ): Promise<PartnerShipmentResult | undefined> {
    if (input.trackingNo?.trim() || !this.shippingPartner.isEnabled()) return undefined;

    const fulfillment = await this.loadForMutation(this.prisma, fulfillmentId, principal);
    if (this.replay(fulfillment, intent)) return undefined;
    if (fulfillment.status !== FULFILLMENT_STATUS.PACKED) return undefined;

    const address = fulfillment.order.addresses[0];
    if (!address) {
      throw new ConflictException('Đơn hàng chưa có địa chỉ giao để tạo vận đơn');
    }

    const pickup = this.branchPickupPoint(fulfillment);
    const isCod = fulfillment.order.checkoutSession.paymentMethod === PAYMENT_METHOD.COD;
    const grandTotal = Math.round(Number(fulfillment.order.grandTotal));
    return this.shippingPartner.createShipment({
      orderId: toEntityId(fulfillment.orderId),
      orderNo: fulfillment.order.orderNo,
      pickup,
      recipientName: address.recipientName,
      recipientPhone: address.recipientPhone,
      addressLine: address.addressLine,
      provinceCode: address.provinceCode,
      ...(address.districtCode ? { districtCode: address.districtCode } : {}),
      ...(address.wardCode ? { wardCode: address.wardCode } : {}),
      weightGrams: this.estimateWeightGrams(fulfillment),
      // COD chỉ thu khi chưa thanh toán trước; chuyển khoản/VNPay đã thu nên cod_amount phải là 0.
      codAmount: isCod ? grandTotal : 0,
      declaredValue: grandTotal,
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    });
  }

  /**
   * Tạo URL in phiếu giao của hãng vận chuyển.
   *
   * SECURITY: URL do hãng phát hành và sống rất ngắn; không lưu vào DB, không đưa vào audit,
   * chỉ trả thẳng cho người vừa yêu cầu in.
   */
  async createLabelUrl(id: string, principal: AuthPrincipal): Promise<FulfillmentLabelDto> {
    this.ensurePersistence();
    const fulfillment = await this.loadForMutation(this.prisma, toDatabaseId(id), principal);
    if (!fulfillment.trackingNo) {
      throw new ConflictException('Giao vận chưa có mã vận đơn để in');
    }
    const url = await this.shippingPartner.createLabelUrl([fulfillment.trackingNo]);
    return { trackingNo: fulfillment.trackingNo, labelUrl: url };
  }

  /**
   * Điểm lấy hàng là địa chỉ chi nhánh sở hữu kho xuất, không phải cấu hình toàn hệ thống:
   * mỗi chi nhánh giao từ địa chỉ của chính nó. Mã quận/phường do Admin chọn qua API địa giới
   * của hãng vận chuyển và nằm trong `branches.address_json`.
   */
  private branchPickupPoint(fulfillment: LoadedFulfillment): PartnerPickupPoint {
    const address = fulfillment.warehouse.branch.addressJson as {
      districtCode?: unknown;
      wardCode?: unknown;
    } | null;
    const districtCode = typeof address?.districtCode === 'string' ? address.districtCode : '';
    const wardCode = typeof address?.wardCode === 'string' ? address.wardCode : '';
    if (!districtCode || !wardCode) {
      throw new ConflictException(
        'Chi nhánh xuất hàng chưa có mã quận/huyện và phường/xã của hãng vận chuyển',
      );
    }
    return { districtCode, wardCode };
  }

  private async cancelPartnerShipment(trackingCode: string, reason: string): Promise<void> {
    try {
      await this.shippingPartner.cancelShipment(trackingCode, reason);
    } catch (cancelError) {
      // Không nuốt lỗi gốc của transaction; chỉ ghi lại để vận hành huỷ tay ở cổng hãng.
      this.logger.error({
        message: 'Không huỷ được vận đơn sau khi xuất kho thất bại',
        trackingCode,
        error: cancelError instanceof Error ? cancelError.message : 'unknown error',
      });
    }
  }

  /** GHN tính cước theo gram; chưa có cân thật nên dùng khối lượng tối thiểu cho mỗi sản phẩm. */
  private estimateWeightGrams(fulfillment: LoadedFulfillment): number {
    const quantity = fulfillment.order.reservation.items.reduce(
      (total, item) => total + item.quantity,
      0,
    );
    return Math.max(DEFAULT_ITEM_WEIGHT_GRAMS, quantity * DEFAULT_ITEM_WEIGHT_GRAMS);
  }

  private shipWithinTransaction(
    fulfillmentId: bigint,
    input: ShipFulfillmentDto,
    intent: TransitionIntent,
    requestId: string,
    principal: AuthPrincipal,
    carrierCode: string | null,
    trackingNo: string | null,
  ): Promise<FulfillmentDetailDto> {
    return this.withSerializationRetry(() => this.prisma.$transaction(async (transaction) => {
      await this.lockAggregate(transaction, fulfillmentId);
      const fulfillment = await this.loadForMutation(transaction, fulfillmentId, principal);
      const replay = this.replay(fulfillment, intent);
      if (replay) return replay;
      this.assertVersion(fulfillment, input.expectedVersion);
      if (fulfillment.status !== FULFILLMENT_STATUS.PACKED || fulfillment.order.status !== ORDER_STATUS.PACKED) {
        throw new ConflictException('Chỉ được bàn giao vận chuyển sau khi đơn đã đóng gói');
      }
      if (
        fulfillment.order.checkoutSession.paymentMethod === PAYMENT_METHOD.BANK_TRANSFER &&
        fulfillment.order.payment?.status !== ORDER_PAYMENT_STATUS.SUCCESS
      ) {
        throw new ConflictException('Đơn chuyển khoản chỉ được xuất kho sau khi đã nhận đủ tiền');
      }
      const reservation = fulfillment.order.reservation;
      if (reservation.status !== INVENTORY_RESERVATION_STATUS.ACTIVE) {
        throw new ConflictException('Giữ chỗ tồn kho của đơn không còn hiệu lực');
      }
      if (reservation.warehouseId !== fulfillment.warehouseId || fulfillment.order.warehouseId !== fulfillment.warehouseId) {
        throw new ConflictException('Kho giao vận không khớp với kho đã giữ hàng của đơn');
      }
      const variantIds = reservation.items.map((item) => item.productVariantId);
      if (variantIds.length === 0) throw new ConflictException('Đơn hàng không có dòng tồn kho để xuất');
      await transaction.$queryRaw(Prisma.sql`
        SELECT id FROM inventory_balances
        WHERE warehouse_id = ${fulfillment.warehouseId}
          AND product_variant_id IN (${Prisma.join(variantIds)})
        ORDER BY product_variant_id FOR UPDATE
      `);
      const balances = await transaction.inventoryBalance.findMany({
        where: { warehouseId: fulfillment.warehouseId, productVariantId: { in: variantIds } },
      });
      const balanceByVariant = new Map(balances.map((balance) => [balance.productVariantId, balance]));
      const now = new Date();
      for (const item of reservation.items) {
        const balance = balanceByVariant.get(item.productVariantId);
        if (!balance || balance.onHand < item.quantity || balance.reserved < item.quantity) {
          throw new ConflictException('Tồn kho thực tế hoặc số lượng giữ chỗ không đủ để xuất hàng');
        }
        const changed = await transaction.inventoryBalance.updateMany({
          where: { id: balance.id, version: balance.version },
          data: {
            onHand: { decrement: item.quantity },
            reserved: { decrement: item.quantity },
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) throw new ConflictException('Tồn kho vừa thay đổi; vui lòng tải lại trước khi xuất hàng');
        await transaction.inventoryMovement.create({
          data: {
            warehouseId: fulfillment.warehouseId,
            productVariantId: item.productVariantId,
            movementType: INVENTORY_MOVEMENT_TYPE.SALE_SHIP,
            quantityDelta: -item.quantity,
            balanceAfter: balance.onHand - item.quantity,
            referenceType: INVENTORY_REFERENCE_TYPE.FULFILLMENT,
            referenceId: toEntityId(fulfillment.id),
            idempotencyKey: `fulfillment-ship:${fulfillment.id}:${item.productVariantId}:${intent.hash}`,
            reason: input.note?.trim() || 'Xuất kho giao đơn hàng',
            occurredAt: now,
            createdBy: toDatabaseId(principal.userId),
          },
        });
      }
      await transaction.inventoryReservation.update({
        where: { id: reservation.id },
        data: { status: INVENTORY_RESERVATION_STATUS.COMMITTED, committedAt: now, version: { increment: 1 } },
      });
      return this.persistTransition(transaction, fulfillment, FULFILLMENT_STATUS.SHIPPED, ORDER_STATUS.SHIPPED,
        ORDER_FULFILLMENT_STATUS.SHIPPED, input.note, intent, requestId, principal, {
          shippedAt: now,
          carrierCode,
          trackingNo,
        });
    }, this.transactionOptions()));
  }

  async failDelivery(
    id: string,
    input: FailDeliveryDto,
    key: string,
    requestId: string,
    principal: AuthPrincipal,
  ): Promise<FulfillmentDetailDto> {
    this.ensurePersistence();
    const fulfillmentId = toDatabaseId(id);
    const intent = this.intent(key, FULFILLMENT_ACTION.FAIL_DELIVERY, id, input);
    return this.withSerializationRetry(() => this.prisma.$transaction(async (transaction) => {
      await this.lockAggregate(transaction, fulfillmentId);
      const fulfillment = await this.loadForMutation(transaction, fulfillmentId, principal);
      const replay = this.replay(fulfillment, intent);
      if (replay) return replay;
      this.assertVersion(fulfillment, input.expectedVersion);
      if (fulfillment.status !== FULFILLMENT_STATUS.SHIPPED) {
        throw new ConflictException('Chỉ ghi nhận giao thất bại với đơn đang vận chuyển');
      }
      const sequence = fulfillment.history.length + 1;
      await transaction.fulfillmentStatusHistory.createMany({ data: [
        {
          fulfillmentId,
          sequenceNo: sequence,
          fromStatus: FULFILLMENT_STATUS.SHIPPED,
          toStatus: FULFILLMENT_STATUS.DELIVERY_FAILED,
          reason: input.reason,
          actorId: toDatabaseId(principal.userId),
          requestId,
          metadataJson: { reasonCode: input.reasonCode },
        },
        {
          fulfillmentId,
          sequenceNo: sequence + 1,
          fromStatus: FULFILLMENT_STATUS.DELIVERY_FAILED,
          toStatus: FULFILLMENT_STATUS.RETURNING_TO_WAREHOUSE,
          reason: 'Hàng đang quay về kho xuất',
          actorId: toDatabaseId(principal.userId),
          requestId,
          idempotencyKey: intent.key,
          requestHash: intent.hash,
        },
      ] });
      await transaction.fulfillment.update({
        where: { id: fulfillmentId },
        data: {
          status: FULFILLMENT_STATUS.RETURNING_TO_WAREHOUSE,
          deliveryFailureReasonCode: input.reasonCode,
          version: { increment: 1 },
        },
      });
      await transaction.order.update({
        where: { id: fulfillment.orderId },
        data: { fulfillmentStatus: ORDER_FULFILLMENT_STATUS.FAILED, version: { increment: 1 } },
      });
      await this.writeAudit(transaction, fulfillment, FULFILLMENT_ACTION.FAIL_DELIVERY, requestId, principal, input.reason,
        FULFILLMENT_STATUS.RETURNING_TO_WAREHOUSE);
      return this.reload(transaction, fulfillmentId);
    }, this.transactionOptions()));
  }

  async receiveReturn(
    id: string,
    input: ReceiveReturnDto,
    key: string,
    requestId: string,
    principal: AuthPrincipal,
  ): Promise<FulfillmentDetailDto> {
    this.ensurePersistence();
    const fulfillmentId = toDatabaseId(id);
    const intent = this.intent(key, FULFILLMENT_ACTION.RECEIVE_RETURN, id, input);
    return this.withSerializationRetry(() => this.prisma.$transaction(async (transaction) => {
      await this.lockAggregate(transaction, fulfillmentId);
      const fulfillment = await this.loadForMutation(transaction, fulfillmentId, principal);
      const replay = this.replay(fulfillment, intent);
      if (replay) return replay;
      this.assertVersion(fulfillment, input.expectedVersion);
      if (fulfillment.status !== FULFILLMENT_STATUS.RETURNING_TO_WAREHOUSE) {
        throw new ConflictException('Chỉ nhận lại hàng đang trên đường quay về kho');
      }
      const items = fulfillment.order.reservation.items;
      if (items.length === 0) throw new ConflictException('Đơn hàng không có dòng tồn kho để nhận hoàn');
      const now = new Date();
      if (input.condition === RETURN_CONDITION.SELLABLE) {
        const variantIds = items.map((item) => item.productVariantId);
        await transaction.$queryRaw(Prisma.sql`
          SELECT id FROM inventory_balances
          WHERE warehouse_id = ${fulfillment.warehouseId}
            AND product_variant_id IN (${Prisma.join(variantIds)})
          ORDER BY product_variant_id FOR UPDATE
        `);
        const balances = await transaction.inventoryBalance.findMany({
          where: { warehouseId: fulfillment.warehouseId, productVariantId: { in: variantIds } },
        });
        const balanceByVariant = new Map(balances.map((balance) => [balance.productVariantId, balance]));
        for (const item of items) {
          const balance = balanceByVariant.get(item.productVariantId);
          if (!balance) throw new ConflictException('Không tìm thấy số dư kho để nhập lại hàng hoàn');
          await transaction.inventoryBalance.update({
            where: { id: balance.id },
            data: { onHand: { increment: item.quantity }, version: { increment: 1 } },
          });
          await transaction.inventoryMovement.create({
            data: {
              warehouseId: fulfillment.warehouseId,
              productVariantId: item.productVariantId,
              movementType: INVENTORY_MOVEMENT_TYPE.DELIVERY_RETURN_RESTOCK,
              quantityDelta: item.quantity,
              balanceAfter: balance.onHand + item.quantity,
              referenceType: INVENTORY_REFERENCE_TYPE.FULFILLMENT,
              referenceId: toEntityId(fulfillment.id),
              idempotencyKey: `fulfillment-return:${fulfillment.id}:${item.productVariantId}:${intent.hash}`,
              reason: input.reason,
              occurredAt: now,
              createdBy: toDatabaseId(principal.userId),
            },
          });
        }
      }
      await transaction.fulfillment.update({
        where: { id: fulfillmentId },
        data: {
          status: FULFILLMENT_STATUS.RETURNED_TO_WAREHOUSE,
          returnedToWarehouseAt: now,
          returnCondition: input.condition,
          version: { increment: 1 },
          history: { create: this.historyInput(fulfillment, FULFILLMENT_STATUS.RETURNED_TO_WAREHOUSE, input.reason, intent, requestId, principal) },
        },
        include: fulfillmentInclude,
      });
      await transaction.order.update({
        where: { id: fulfillment.orderId },
        data: { fulfillmentStatus: ORDER_FULFILLMENT_STATUS.RETURNED, version: { increment: 1 } },
      });
      await this.writeAudit(transaction, fulfillment, FULFILLMENT_ACTION.RECEIVE_RETURN, requestId, principal, input.reason,
        FULFILLMENT_STATUS.RETURNED_TO_WAREHOUSE);
      return this.reload(transaction, fulfillmentId);
    }, this.transactionOptions()));
  }

  private async simpleTransition(
    id: string,
    input: FulfillmentTransitionDto,
    key: string,
    requestId: string,
    principal: AuthPrincipal,
    action: 'PICK' | 'PACK' | 'DELIVER',
  ): Promise<FulfillmentDetailDto> {
    const mapping = {
      PICK: { from: FULFILLMENT_STATUS.PENDING, to: FULFILLMENT_STATUS.PICKING, order: ORDER_STATUS.PICKING, summary: ORDER_FULFILLMENT_STATUS.PICKING },
      PACK: { from: FULFILLMENT_STATUS.PICKING, to: FULFILLMENT_STATUS.PACKED, order: ORDER_STATUS.PACKED, summary: ORDER_FULFILLMENT_STATUS.PACKED },
      DELIVER: { from: FULFILLMENT_STATUS.SHIPPED, to: FULFILLMENT_STATUS.DELIVERED, order: ORDER_STATUS.DELIVERED, summary: ORDER_FULFILLMENT_STATUS.DELIVERED },
    }[action];
    this.ensurePersistence();
    const fulfillmentId = toDatabaseId(id);
    const intent = this.intent(key, action, id, input);
    return this.withSerializationRetry(() => this.prisma.$transaction(async (transaction) => {
      await this.lockAggregate(transaction, fulfillmentId);
      const fulfillment = await this.loadForMutation(transaction, fulfillmentId, principal);
      const replay = this.replay(fulfillment, intent);
      if (replay) return replay;
      this.assertVersion(fulfillment, input.expectedVersion);
      if (fulfillment.status !== mapping.from) {
        throw new ConflictException(`Không thể chuyển giao vận từ ${fulfillment.status} sang ${mapping.to}`);
      }
      if (action === FULFILLMENT_ACTION.PICK && fulfillment.order.status !== ORDER_STATUS.CONFIRMED) {
        throw new ConflictException('Đơn hàng phải được xác nhận trước khi lấy hàng');
      }
      const now = new Date();
      const timestamps = action === FULFILLMENT_ACTION.PICK
        ? { pickedAt: now }
        : action === FULFILLMENT_ACTION.PACK
          ? { packedAt: now }
          : { deliveredAt: now };
      return this.persistTransition(transaction, fulfillment, mapping.to, mapping.order, mapping.summary,
        input.note, intent, requestId, principal, timestamps);
    }, this.transactionOptions()));
  }

  private async persistTransition(
    transaction: Prisma.TransactionClient,
    fulfillment: LoadedFulfillment,
    nextStatus: string,
    nextOrderStatus: string,
    nextSummary: string,
    reason: string | undefined,
    intent: TransitionIntent,
    requestId: string,
    principal: AuthPrincipal,
    patch: Prisma.FulfillmentUpdateInput,
  ): Promise<FulfillmentDetailDto> {
    const updated = await transaction.fulfillment.update({
      where: { id: fulfillment.id },
      data: {
        ...patch,
        status: nextStatus,
        version: { increment: 1 },
        history: { create: this.historyInput(fulfillment, nextStatus, reason, intent, requestId, principal) },
      },
      include: fulfillmentInclude,
    });
    await transaction.order.update({
      where: { id: fulfillment.orderId },
      data: {
        status: nextOrderStatus,
        fulfillmentStatus: nextSummary,
        version: { increment: 1 },
        statusHistory: {
          create: {
            sequenceNo: fulfillment.order.statusHistory.length + 1,
            fromStatus: fulfillment.order.status,
            toStatus: nextOrderStatus,
            reason: reason?.trim() || null,
            actorType: 'USER',
            actorId: toDatabaseId(principal.userId),
            requestId,
            idempotencyKey: intent.key,
            requestHash: intent.hash,
          },
        },
      },
    });
    await this.writeAudit(transaction, fulfillment, `fulfillment.${nextStatus.toLowerCase()}`, requestId, principal, reason, nextStatus);
    await this.notifyCustomer(transaction, fulfillment, nextStatus);
    return this.reload(transaction, updated.id);
  }

  /**
   * Báo cho khách khi đơn đổi trạng thái giao vận.
   *
   * Đặt ở `persistTransition` vì đây là chỗ duy nhất mọi chuyển trạng thái đi qua: thêm một hành
   * động mới sau này tự có email, không phải nhớ nối lại.
   *
   * TRANSACTION: ghi ý định cùng transaction chuyển trạng thái. Chuyển trạng thái rollback thì email
   * cũng không gửi — khách không nhận tin "đã giao" cho một đơn thực ra chưa giao.
   *
   * Chỉ báo những mốc khách thật sự quan tâm. `PICKING`/`PACKED` là việc nội bộ của kho; gửi email
   * cho từng bước biến hộp thư của khách thành nhật ký vận hành của cửa hàng.
   */
  private async notifyCustomer(
    transaction: Prisma.TransactionClient,
    fulfillment: LoadedFulfillment,
    nextStatus: string,
  ): Promise<void> {
    if (!CUSTOMER_VISIBLE_FULFILLMENT_STATUSES.has(nextStatus)) return;
    const address = fulfillment.order.addresses[0];
    const recipientEmail = address?.recipientEmail?.trim();
    // Đơn tại quầy thường chỉ có số điện thoại; không có email thì không gửi.
    if (!recipientEmail) return;

    await this.outbox.append(
      {
        aggregateType: 'FULFILLMENT',
        aggregateId: toEntityId(fulfillment.id),
        eventType: OUTBOX_EVENT_TYPE.ORDER_FULFILLMENT_UPDATED,
        payload: {
          recipientEmail,
          recipientName: address.recipientName,
          orderNo: fulfillment.order.orderNo,
          status: nextStatus,
          trackingCode: fulfillment.trackingNo ?? null,
        },
      },
      transaction,
    );
  }

  private historyInput(
    fulfillment: LoadedFulfillment,
    nextStatus: string,
    reason: string | undefined,
    intent: TransitionIntent,
    requestId: string,
    principal: AuthPrincipal,
  ): Prisma.FulfillmentStatusHistoryUncheckedCreateWithoutFulfillmentInput {
    return {
      sequenceNo: fulfillment.history.length + 1,
      fromStatus: fulfillment.status,
      toStatus: nextStatus,
      reason: reason?.trim() || null,
      actorId: toDatabaseId(principal.userId),
      requestId,
      idempotencyKey: intent.key,
      requestHash: intent.hash,
    };
  }

  private async writeAudit(
    transaction: Prisma.TransactionClient,
    fulfillment: LoadedFulfillment,
    action: string,
    requestId: string,
    principal: AuthPrincipal,
    reason: string | undefined,
    nextStatus: string,
  ): Promise<void> {
    await this.audit.write({
      requestId,
      sequenceNo: 1,
      actorType: 'USER',
      actorUserId: principal.userId,
      action,
      entityType: 'FULFILLMENT',
      entityId: toEntityId(fulfillment.id),
      before: { status: fulfillment.status, version: fulfillment.version.toString() },
      after: { status: nextStatus },
      reason,
    }, transaction);
  }

  private async lockAggregate(transaction: Prisma.TransactionClient, fulfillmentId: bigint): Promise<void> {
    // CONCURRENCY: lock order is fixed across fulfillment commands to avoid ship/cancel/payment races.
    await transaction.$queryRaw(Prisma.sql`
      SELECT customer_order.id
      FROM fulfillments fulfillment
      JOIN orders customer_order ON customer_order.id = fulfillment.order_id
      JOIN inventory_reservations reservation ON reservation.id = customer_order.reservation_id
      WHERE fulfillment.id = ${fulfillmentId}
      FOR UPDATE OF customer_order, fulfillment, reservation
    `);
    // Payment is optional at schema level for migration compatibility, so it must be
    // locked separately instead of using an outer join with FOR UPDATE.
    await transaction.$queryRaw(Prisma.sql`
      SELECT payment.id
      FROM payments payment
      JOIN fulfillments fulfillment ON fulfillment.order_id = payment.order_id
      WHERE fulfillment.id = ${fulfillmentId}
      FOR UPDATE OF payment
    `);
  }

  private async loadForMutation(
    transaction: Prisma.TransactionClient,
    fulfillmentId: bigint,
    principal: AuthPrincipal,
  ): Promise<LoadedFulfillment> {
    const fulfillment = await transaction.fulfillment.findFirst({
      where: { id: fulfillmentId, AND: [this.scopeWhere(principal)] },
      include: fulfillmentInclude,
    });
    if (!fulfillment) throw new NotFoundException('Không tìm thấy giao vận trong phạm vi được phân quyền');
    return fulfillment;
  }

  private replay(fulfillment: LoadedFulfillment, intent: TransitionIntent): FulfillmentDetailDto | undefined {
    const history = fulfillment.history.find((item) => item.idempotencyKey === intent.key);
    if (!history) return undefined;
    if (history.requestHash !== intent.hash) {
      throw new ConflictException('Thao tác này đã được dùng cho một lệnh giao vận khác. Vui lòng tải lại rồi thử lại.');
    }
    return this.toDetail(fulfillment);
  }

  private intent(key: string, action: string, id: string, input: object): TransitionIntent {
    const normalizedKey = key.trim();
    if (normalizedKey.length < 8 || normalizedKey.length > 150) {
      throw new BadRequestException('Không gửi được yêu cầu. Vui lòng thử lại.');
    }
    return {
      key: normalizedKey,
      hash: createHash('sha256').update(JSON.stringify({ action, id, input })).digest('hex'),
    };
  }

  private assertVersion(fulfillment: LoadedFulfillment, expectedVersion: string): void {
    if (!/^\d+$/.test(expectedVersion)) throw new BadRequestException('Phiên bản giao vận phải là số nguyên không âm');
    if (fulfillment.version !== BigInt(expectedVersion)) {
      throw new ConflictException('Giao vận đã thay đổi; vui lòng tải lại trước khi thao tác');
    }
  }

  private queryWhere(query: AdminFulfillmentQueryDto, principal: AuthPrincipal): Prisma.FulfillmentWhereInput {
    const filters: Prisma.FulfillmentWhereInput[] = [this.scopeWhere(principal)];
    if (query.status) filters.push({ status: query.status });
    if (query.search) filters.push({ OR: [
      { fulfillmentNo: { contains: query.search, mode: 'insensitive' } },
      { trackingNo: { contains: query.search, mode: 'insensitive' } },
      { order: { orderNo: { contains: query.search, mode: 'insensitive' } } },
      { order: { addresses: { some: { recipientName: { contains: query.search, mode: 'insensitive' } } } } },
      { order: { addresses: { some: { recipientPhone: { contains: query.search, mode: 'insensitive' } } } } },
      { order: { addresses: { some: { recipientEmail: { contains: query.search, mode: 'insensitive' } } } } },
    ] });
    return { AND: filters };
  }

  private scopeWhere(principal: AuthPrincipal): Prisma.FulfillmentWhereInput {
    if (principal.scopes.some((scope) => scope.type === ScopeType.GLOBAL)) return {};
    const branchIds = principal.scopes
      .filter((scope) => scope.type === ScopeType.BRANCH && scope.branchId)
      .map((scope) => toDatabaseId(scope.branchId!));
    if (branchIds.length === 0) throw new ForbiddenException('Tài khoản chưa được gán phạm vi chi nhánh');
    return { order: { branchId: { in: branchIds } } };
  }

  private toSummary(fulfillment: LoadedFulfillmentSummary) {
    const recipient = fulfillment.order.addresses[0];
    return {
      id: toEntityId(fulfillment.id),
      fulfillmentNo: fulfillment.fulfillmentNo,
      orderId: toEntityId(fulfillment.orderId),
      orderNo: fulfillment.order.orderNo,
      warehouseId: toEntityId(fulfillment.warehouseId),
      warehouseName: fulfillment.warehouse.name,
      status: fulfillment.status,
      carrierCode: fulfillment.carrierCode,
      trackingNo: fulfillment.trackingNo,
      recipientName: recipient?.recipientName ?? '',
      recipientPhone: recipient?.recipientPhone ?? '',
      recipientEmail: recipient?.recipientEmail ?? null,
      createdAt: fulfillment.createdAt.toISOString(),
      version: fulfillment.version.toString(),
    };
  }

  private toDetail(fulfillment: LoadedFulfillment): FulfillmentDetailDto {
    return {
      ...this.toSummary(fulfillment),
      orderStatus: fulfillment.order.status,
      paymentStatus: fulfillment.order.payment?.status ?? fulfillment.order.paymentStatus,
      paymentMethod: fulfillment.order.checkoutSession.paymentMethod,
      pickedAt: fulfillment.pickedAt?.toISOString() ?? null,
      packedAt: fulfillment.packedAt?.toISOString() ?? null,
      shippedAt: fulfillment.shippedAt?.toISOString() ?? null,
      deliveredAt: fulfillment.deliveredAt?.toISOString() ?? null,
      deliveryFailureReasonCode: fulfillment.deliveryFailureReasonCode,
      returnedToWarehouseAt: fulfillment.returnedToWarehouseAt?.toISOString() ?? null,
      returnCondition: fulfillment.returnCondition,
      history: fulfillment.history.map((item) => ({
        sequenceNo: item.sequenceNo,
        fromStatus: item.fromStatus,
        toStatus: item.toStatus,
        reason: item.reason,
        createdAt: item.createdAt.toISOString(),
      })),
    };
  }

  private async reload(transaction: Prisma.TransactionClient, id: bigint): Promise<FulfillmentDetailDto> {
    const fulfillment = await transaction.fulfillment.findUniqueOrThrow({ where: { id }, include: fulfillmentInclude });
    return this.toDetail(fulfillment);
  }

  private transactionOptions() {
    return {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: FULFILLMENT_TRANSACTION.MAX_WAIT_MS,
      timeout: FULFILLMENT_TRANSACTION.TIMEOUT_MS,
    } as const;
  }

  private async withSerializationRetry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < FULFILLMENT_TRANSACTION.MAX_SERIALIZATION_RETRIES; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : (error as { code?: unknown })?.code;
        if ((code === 'P2034' || code === '40001') && attempt + 1 < FULFILLMENT_TRANSACTION.MAX_SERIALIZATION_RETRIES) continue;
        throw error;
      }
    }
    throw new ServiceUnavailableException('Không thể xử lý giao vận do xung đột đồng thời; vui lòng thử lại');
  }

  private ensurePersistence(): void {
    if (!this.prisma.isEnabled()) throw new ServiceUnavailableException('Kho dữ liệu giao vận chưa được bật');
  }
}
