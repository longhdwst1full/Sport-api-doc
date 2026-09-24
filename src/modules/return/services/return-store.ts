import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toDatabaseId, toEntityId } from '../../../common/identifiers/entity-id';
import { branchScopeWhere } from '../../../common/security/branch-scope';
import { PrismaService } from '../../../database/prisma.service';
import { AuditWriter } from '../../audit/audit.writer';
import type { AuthPrincipal } from '../../auth/auth.types';
import type { OutboxEventType } from '../../notification/notification.constants';
import { OutboxWriter } from '../../notification/outbox.writer';
import type { ReturnDetailDto, ReturnSummaryDto } from '../dto/return.dto';
import {
  REFUND_COUNTED_STATUSES,
  REFUND_STATUS,
  RETURN_AUDIT_ENTITY,
  RETURN_ERROR_CODE,
  RETURN_TRANSACTION,
  type ReturnAction,
} from '../return.constants';
import { allowedRefundMethods, refundableRemaining } from '../return.policy';

export const returnInclude = {
  order: {
    select: {
      id: true,
      orderNo: true,
      shippingTotal: true,
      addresses: { orderBy: { id: 'asc' as const }, take: 1 },
      payment: {
        select: {
          id: true,
          method: true,
          status: true,
          receivedAmount: true,
          version: true,
          refunds: { select: { id: true, amount: true, status: true } },
        },
      },
    },
  },
  items: {
    orderBy: { id: 'asc' as const },
    include: {
      orderItem: {
        select: {
          id: true,
          productVariantId: true,
          itemType: true,
          skuSnapshot: true,
          productNameSnapshot: true,
          variantNameSnapshot: true,
          quantity: true,
          finalUnitPrice: true,
          lineTotal: true,
          components: { select: { componentVariantId: true, quantityPerBundle: true } },
        },
      },
    },
  },
  refunds: { orderBy: { id: 'asc' as const } },
  history: { orderBy: { sequenceNo: 'asc' as const } },
} satisfies Prisma.ReturnRequestInclude;

export const returnSummaryInclude = {
  order: { select: { orderNo: true, addresses: { orderBy: { id: 'asc' as const }, take: 1 } } },
  _count: { select: { items: true } },
} satisfies Prisma.ReturnRequestInclude;

export type LoadedReturn = Prisma.ReturnRequestGetPayload<{ include: typeof returnInclude }>;
type LoadedReturnSummary = Prisma.ReturnRequestGetPayload<{ include: typeof returnSummaryInclude }>;

export type ReturnActor =
  | { type: 'CUSTOMER'; userId: string }
  | { type: 'USER'; principal: AuthPrincipal };

export interface CommandIntent {
  key: string;
  hash: string;
}

const ZERO = new Prisma.Decimal(0);

/**
 * Phần persistence dùng chung của phiếu trả: khoá, nạp, replay, ghi lịch sử/audit/outbox và map DTO.
 *
 * Tách khỏi `ReturnService`/`RefundService` để hai service cùng một thứ tự khoá và cùng một cách
 * replay; hai bản sao lệch nhau là cách deadlock hoặc hoàn trùng xuất hiện.
 */
@Injectable()
export class ReturnStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
  ) {}

  get client(): PrismaService {
    return this.prisma;
  }

  ensurePersistence(): void {
    if (!this.prisma.isEnabled()) throw new ServiceUnavailableException('Kho dữ liệu đổi trả chưa được bật');
  }

  /**
   * TRANSACTION: Serializable + retry có giới hạn, giống Fulfillment. Mọi lệnh trên phiếu đọc tổng
   * tiền đã hoàn rồi ghi lượt mới; ở mức thấp hơn, hai lệnh song song có thể cùng thấy "còn đủ tiền".
   */
  async run<T>(operation: (transaction: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < RETURN_TRANSACTION.MAX_SERIALIZATION_RETRIES; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: RETURN_TRANSACTION.MAX_WAIT_MS,
          timeout: RETURN_TRANSACTION.TIMEOUT_MS,
        });
      } catch (error) {
        const code =
          error instanceof Prisma.PrismaClientKnownRequestError ? error.code : (error as { code?: unknown })?.code;
        if ((code === 'P2034' || code === '40001') && attempt + 1 < RETURN_TRANSACTION.MAX_SERIALIZATION_RETRIES) {
          continue;
        }
        throw error;
      }
    }
    throw new ServiceUnavailableException('Không thể xử lý phiếu trả do xung đột đồng thời; vui lòng thử lại');
  }

  /**
   * TRANSACTION: thứ tự khoá cố định return → order → payment. Tồn kho (nếu có) khoá SAU cùng theo
   * `product_variant_id` tăng dần, cùng thứ tự với xuất kho của Fulfillment để không deadlock chéo.
   */
  async lock(transaction: Prisma.TransactionClient, returnId: bigint): Promise<void> {
    await transaction.$queryRaw(Prisma.sql`
      SELECT return_request.id
      FROM return_requests return_request
      JOIN orders customer_order ON customer_order.id = return_request.order_id
      WHERE return_request.id = ${returnId}
      FOR UPDATE OF return_request, customer_order
    `);
    await transaction.$queryRaw(Prisma.sql`
      SELECT payment.id
      FROM payments payment
      JOIN return_requests return_request ON return_request.order_id = payment.order_id
      WHERE return_request.id = ${returnId}
      FOR UPDATE OF payment
    `);
  }

  async load(
    transaction: Prisma.TransactionClient,
    where: Prisma.ReturnRequestWhereInput,
  ): Promise<LoadedReturn> {
    const found = await transaction.returnRequest.findFirst({ where, include: returnInclude });
    // SECURITY: một thông báo cho cả "không tồn tại" lẫn "không thuộc phạm vi", không lộ phiếu của người khác.
    if (!found) throw new NotFoundException('Không tìm thấy phiếu trả hàng');
    return found;
  }

  reload(transaction: Prisma.TransactionClient, id: bigint): Promise<LoadedReturn> {
    return transaction.returnRequest.findUniqueOrThrow({ where: { id }, include: returnInclude });
  }

  /** SECURITY: Admin lọc theo chi nhánh của phiếu; tài khoản chưa có phạm vi nhận 403 (màn thao tác). */
  scopeWhere(actor: ReturnActor): Prisma.ReturnRequestWhereInput {
    if (actor.type === 'CUSTOMER') {
      return { order: { checkoutSession: { cart: { userId: toDatabaseId(actor.userId) } } } };
    }
    return branchScopeWhere(actor.principal, { strict: true });
  }

  intent(rawKey: string, action: ReturnAction, target: string, input: object): CommandIntent {
    const key = rawKey.trim();
    if (key.length < 8 || key.length > 150) {
      throw new BadRequestException('Thiếu hoặc sai header Idempotency-Key (8-150 ký tự)');
    }
    return {
      key,
      hash: createHash('sha256').update(JSON.stringify({ action, target, input })).digest('hex'),
    };
  }

  /**
   * IDEMPOTENCY: cùng key + cùng payload trả kết quả hiện tại của phiếu; cùng key khác payload là
   * xung đột. Key nằm trong lịch sử của chính phiếu nên không va với key của phiếu khác.
   */
  replay(returnRequest: LoadedReturn, intent: CommandIntent, forCustomer: boolean): ReturnDetailDto | undefined {
    const history = returnRequest.history.find((entry) => entry.idempotencyKey === intent.key);
    if (!history) return undefined;
    if (history.requestHash !== intent.hash) throw this.idempotencyConflict();
    return this.toDetail(returnRequest, forCustomer);
  }

  idempotencyConflict(): ConflictException {
    return new ConflictException({
      code: RETURN_ERROR_CODE.IDEMPOTENCY_CONFLICT,
      message: 'Thao tác này đã được dùng cho một yêu cầu khác. Vui lòng tải lại rồi thử lại.',
    });
  }

  assertVersion(returnRequest: LoadedReturn, expectedVersion: string): void {
    if (returnRequest.version !== BigInt(expectedVersion)) {
      throw new ConflictException({
        code: RETURN_ERROR_CODE.VERSION_CONFLICT,
        message: 'Phiếu trả đã thay đổi; vui lòng tải lại trước khi thao tác',
      });
    }
  }

  actorColumns(actor: ReturnActor): { actorType: string; actorId: bigint } {
    return actor.type === 'CUSTOMER'
      ? { actorType: 'CUSTOMER', actorId: toDatabaseId(actor.userId) }
      : { actorType: 'USER', actorId: toDatabaseId(actor.principal.userId) };
  }

  /** Ghi lịch sử + tăng version phiếu trong cùng transaction với thay đổi nghiệp vụ. */
  async appendHistory(
    transaction: Prisma.TransactionClient,
    returnRequest: LoadedReturn,
    entry: {
      action: ReturnAction;
      toStatus: string;
      reason?: string | null;
      actor: ReturnActor;
      requestId: string;
      intent?: CommandIntent;
      patch?: Prisma.ReturnRequestUncheckedUpdateInput;
    },
  ): Promise<void> {
    await transaction.returnRequest.update({
      where: { id: returnRequest.id },
      data: {
        ...entry.patch,
        status: entry.toStatus,
        version: { increment: 1 },
      },
    });
    await transaction.returnStatusHistory.create({
      data: {
        returnRequestId: returnRequest.id,
        sequenceNo: returnRequest.history.length + 1,
        action: entry.action,
        fromStatus: returnRequest.status,
        toStatus: entry.toStatus,
        reason: entry.reason?.trim() || null,
        ...this.actorColumns(entry.actor),
        requestId: entry.requestId,
        idempotencyKey: entry.intent?.key ?? null,
        requestHash: entry.intent?.hash ?? null,
      },
    });
  }

  async writeAudit(
    transaction: Prisma.TransactionClient,
    input: {
      returnId: bigint;
      action: string;
      actor: ReturnActor;
      requestId: string;
      before?: Prisma.InputJsonValue;
      after?: Prisma.InputJsonValue;
      reason?: string | null;
    },
  ): Promise<void> {
    await this.audit.write(
      {
        requestId: input.requestId,
        sequenceNo: 1,
        actorType: 'USER',
        actorUserId: input.actor.type === 'CUSTOMER' ? input.actor.userId : input.actor.principal.userId,
        action: input.action,
        entityType: RETURN_AUDIT_ENTITY,
        entityId: toEntityId(input.returnId),
        before: input.before,
        after: input.after,
        reason: input.reason ?? undefined,
      },
      transaction,
    );
  }

  /**
   * TRANSACTION: email ghi vào outbox cùng transaction nghiệp vụ; rollback thì không gửi. Đơn tại
   * quầy thường không có email nên bỏ qua im lặng.
   */
  async notify(
    transaction: Prisma.TransactionClient,
    returnRequest: LoadedReturn,
    eventType: OutboxEventType,
    payload: Record<string, Prisma.InputJsonValue | null>,
  ): Promise<void> {
    const address = returnRequest.order.addresses[0];
    const recipientEmail = address?.recipientEmail?.trim();
    if (!recipientEmail) return;
    await this.outbox.append(
      {
        aggregateType: RETURN_AUDIT_ENTITY,
        aggregateId: toEntityId(returnRequest.id),
        eventType,
        payload: {
          recipientEmail,
          recipientName: address.recipientName,
          returnNo: returnRequest.returnNo,
          orderNo: returnRequest.order.orderNo,
          ...payload,
        },
      },
      transaction,
    );
  }

  /** Số hiệu ngày theo giờ Việt Nam, để mã phiếu khớp ngày nhân viên nhìn thấy trên màn hình. */
  documentNo(prefix: string, id: bigint, now: Date): string {
    const local = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const day = local.toISOString().slice(0, 10).replaceAll('-', '');
    return `${prefix}-${day}-${id.toString().padStart(6, '0')}`;
  }

  amounts(returnRequest: LoadedReturn): {
    refunded: Prisma.Decimal;
    pending: Prisma.Decimal;
    refundable: Prisma.Decimal;
  } {
    const sum = (rows: { amount: Prisma.Decimal; status: string }[], statuses: readonly string[]) =>
      rows.filter((row) => statuses.includes(row.status)).reduce((total, row) => total.add(row.amount), ZERO);
    const refunded = sum(returnRequest.refunds, [REFUND_STATUS.SUCCEEDED]);
    const pending = sum(returnRequest.refunds, [REFUND_STATUS.PENDING]);
    const payment = returnRequest.order.payment;
    const refundable =
      returnRequest.refundCap && payment
        ? refundableRemaining({
            returnRefundCap: returnRequest.refundCap,
            countedOnReturn: refunded.add(pending),
            paymentReceivedAmount: payment.receivedAmount,
            countedOnPayment: sum(payment.refunds, REFUND_COUNTED_STATUSES),
          })
        : ZERO;
    return { refunded, pending, refundable };
  }

  toSummary(returnRequest: LoadedReturn | LoadedReturnSummary): ReturnSummaryDto {
    const recipient = returnRequest.order.addresses[0];
    const itemCount = '_count' in returnRequest ? returnRequest._count.items : returnRequest.items.length;
    return {
      id: toEntityId(returnRequest.id),
      returnNo: returnRequest.returnNo,
      orderId: toEntityId(returnRequest.orderId),
      orderNo: returnRequest.order.orderNo,
      status: returnRequest.status,
      channel: returnRequest.channel,
      reasonCode: returnRequest.reasonCode,
      fault: returnRequest.fault,
      recipientName: recipient?.recipientName ?? '',
      itemCount,
      createdAt: returnRequest.createdAt.toISOString(),
      version: returnRequest.version.toString(),
    };
  }

  toDetail(returnRequest: LoadedReturn, forCustomer: boolean): ReturnDetailDto {
    const amounts = this.amounts(returnRequest);
    const payment = returnRequest.order.payment;
    return {
      ...this.toSummary(returnRequest),
      description: returnRequest.description,
      evidenceUrls: Array.isArray(returnRequest.evidenceUrls)
        ? returnRequest.evidenceUrls.filter((url): url is string => typeof url === 'string')
        : [],
      deliveredAt: returnRequest.deliveredAt.toISOString(),
      windowOverridden: returnRequest.windowOverrideBy !== null,
      // SECURITY: ghi chú override là trao đổi nội bộ, không trả cho khách.
      windowOverrideNote: forCustomer ? null : returnRequest.windowOverrideNote,
      decisionNote: returnRequest.decisionNote,
      decidedAt: returnRequest.decidedAt?.toISOString() ?? null,
      receivedAt: returnRequest.receivedAt?.toISOString() ?? null,
      closedAt: returnRequest.closedAt?.toISOString() ?? null,
      refundCap: returnRequest.refundCap?.toFixed(2) ?? null,
      refundedAmount: amounts.refunded.toFixed(2),
      pendingRefundAmount: amounts.pending.toFixed(2),
      refundableAmount: amounts.refundable.toFixed(2),
      allowedRefundMethods: payment ? [...allowedRefundMethods(payment.method)] : [],
      items: returnRequest.items.map((item) => ({
        id: toEntityId(item.id),
        orderItemId: toEntityId(item.orderItemId),
        sku: item.orderItem.skuSnapshot,
        productName: item.orderItem.productNameSnapshot,
        variantName: item.orderItem.variantNameSnapshot,
        itemType: item.orderItem.itemType,
        quantity: item.quantity,
        unitPrice: item.orderItem.finalUnitPrice.toFixed(2),
        condition: item.condition,
        disposition: item.disposition,
        restockQty: item.restockQty,
        refundCap: item.refundCap?.toFixed(2) ?? null,
        note: item.note,
      })),
      refunds: returnRequest.refunds.map((refund) => ({
        id: toEntityId(refund.id),
        refundNo: refund.refundNo,
        method: refund.method,
        amount: refund.amount.toFixed(2),
        status: refund.status,
        externalRef: refund.externalRef,
        note: forCustomer ? null : refund.note,
        failureReason: refund.failureReason,
        processedAt: refund.processedAt?.toISOString() ?? null,
        createdAt: refund.createdAt.toISOString(),
        version: refund.version.toString(),
      })),
      history: returnRequest.history.map((entry) => ({
        sequenceNo: entry.sequenceNo,
        action: entry.action,
        fromStatus: entry.fromStatus,
        toStatus: entry.toStatus,
        reason: entry.reason,
        createdAt: entry.createdAt.toISOString(),
      })),
    };
  }
}
