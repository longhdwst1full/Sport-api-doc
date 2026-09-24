import { createHash } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toDatabaseId, toEntityId } from '../../../common/identifiers/entity-id';
import type { AuthPrincipal } from '../../auth/auth.types';
import { OUTBOX_EVENT_TYPE } from '../../notification/notification.constants';
import { PAYMENT_STATUS } from '../../payment/payment.constants';
import type { ConfirmRefundDto, CreateRefundDto, ReturnDetailDto, ReturnReasonCommandDto } from '../dto/return.dto';
import {
  REFUND_COUNTED_STATUSES,
  REFUND_METHOD,
  REFUND_STATUS,
  RETURN_ACTION,
  RETURN_ERROR_CODE,
  RETURN_STATUS,
} from '../return.constants';
import { assertRefundMethod, assertTransition, refundableRemaining } from '../return.policy';
import { ReturnStore, type LoadedReturn, type ReturnActor } from './return-store';

const conflict = (code: string, message: string) => new ConflictException({ code, message });
const ZERO = new Prisma.Decimal(0);

/**
 * Hoàn tiền thủ công cho phiếu trả đã nhận hàng (D58): tiền mặt tại quầy hoặc chuyển khoản.
 *
 * Hai bước có chủ đích: `request` ghi ý định và giữ số tiền (PENDING được tính vào phần đã dùng),
 * `confirm` chỉ chạy SAU khi tiền đã thật sự rời cửa hàng và bắt buộc có bằng chứng. D56: quyền
 * `payment.refund.approve` mới được xác nhận; người có cả hai quyền tự làm cả hai bước.
 */
@Injectable()
export class RefundService {
  constructor(private readonly store: ReturnStore) {}

  async request(
    id: string,
    input: CreateRefundDto,
    rawKey: string,
    requestId: string,
    principal: AuthPrincipal,
  ): Promise<ReturnDetailDto> {
    this.store.ensurePersistence();
    const actor: ReturnActor = { type: 'USER', principal };
    const returnId = toDatabaseId(id);
    const intent = this.store.intent(rawKey, RETURN_ACTION.REFUND_REQUEST, id, input);
    const amount = new Prisma.Decimal(input.amount);
    return this.store.run(async (transaction) => {
      await this.store.lock(transaction, returnId);
      const current = await this.store.load(transaction, { id: returnId, AND: [this.store.scopeWhere(actor)] });
      const replay = this.store.replay(current, intent, false);
      if (replay) return replay;
      this.store.assertVersion(current, input.expectedVersion);
      assertTransition(current.status, RETURN_ACTION.REFUND_REQUEST);

      const payment = current.order.payment;
      if (!payment || payment.status !== PAYMENT_STATUS.SUCCESS) {
        throw conflict(RETURN_ERROR_CODE.REFUND_PAYMENT_NOT_SUCCESS, 'Đơn chưa ghi nhận thu tiền thành công nên chưa thể hoàn');
      }
      assertRefundMethod(payment.method, input.method);
      if (current.refunds.some((refund) => refund.status === REFUND_STATUS.PENDING)) {
        throw conflict(RETURN_ERROR_CODE.REFUND_PENDING_EXISTS, 'Phiếu đang có một lượt hoàn chờ xác nhận');
      }
      // INVARIANT: chặn đồng thời theo phiếu và theo tiền đã thu, tính trên dữ liệu vừa khoá.
      const remaining = this.remaining(current);
      if (amount.lte(ZERO) || amount.gt(remaining)) {
        throw conflict(
          RETURN_ERROR_CODE.REFUND_EXCEEDS_REMAINING,
          `Số tiền hoàn tối đa còn lại là ${remaining.toFixed(2)}`,
        );
      }

      const now = new Date();
      // IDEMPOTENCY: khoá lưu ở refunds là hash(phiếu, key) — độ dài cố định và không va giữa hai phiếu
      // dùng trùng key. Không dùng hash payload: hai lượt hợp lệ cùng số tiền (lượt trước FAILED) sẽ trùng.
      const refundKey = createHash('sha256').update(`${current.id}:${intent.key}`).digest('hex');
      const created = await transaction.refund.create({
        data: {
          refundNo: `TMP-${refundKey.slice(0, 24)}`,
          returnRequestId: current.id,
          paymentId: payment.id,
          method: input.method,
          amount,
          note: input.note ?? null,
          idempotencyKey: refundKey,
          requestHash: intent.hash,
          requestedBy: toDatabaseId(principal.userId),
        },
      });
      await transaction.refund.update({
        where: { id: created.id },
        data: { refundNo: this.store.documentNo('RF', created.id, now) },
      });
      await this.store.appendHistory(transaction, current, {
        action: RETURN_ACTION.REFUND_REQUEST,
        toStatus: current.status,
        reason: `${input.method} ${amount.toFixed(2)}${input.note ? ` - ${input.note}` : ''}`,
        actor,
        requestId,
        intent,
      });
      await this.store.writeAudit(transaction, {
        returnId: current.id,
        action: 'return.refund.request',
        actor,
        requestId,
        after: { refundId: toEntityId(created.id), method: input.method, amount: amount.toFixed(2) },
        reason: input.note,
      });
      return this.store.toDetail(await this.store.reload(transaction, current.id), false);
    });
  }

  /**
   * Xác nhận tiền đã trả cho khách.
   *
   * CONTRACT: chuyển khoản bắt buộc mã giao dịch; tiền mặt bắt buộc người xác nhận tick đã đưa tiền.
   * Hoàn đủ trần phiếu thì phiếu sang REFUNDED; hoàn đủ số đã thu thì payment và đơn sang REFUNDED.
   */
  async confirm(
    id: string,
    refundId: string,
    input: ConfirmRefundDto,
    rawKey: string,
    requestId: string,
    principal: AuthPrincipal,
  ): Promise<ReturnDetailDto> {
    this.store.ensurePersistence();
    const actor: ReturnActor = { type: 'USER', principal };
    const returnId = toDatabaseId(id);
    const intent = this.store.intent(rawKey, RETURN_ACTION.REFUND_CONFIRM, `${id}:${refundId}`, input);
    return this.store.run(async (transaction) => {
      await this.store.lock(transaction, returnId);
      const current = await this.store.load(transaction, { id: returnId, AND: [this.store.scopeWhere(actor)] });
      const replay = this.store.replay(current, intent, false);
      if (replay) return replay;
      this.store.assertVersion(current, input.expectedVersion);
      assertTransition(current.status, RETURN_ACTION.REFUND_CONFIRM);
      const refund = this.pendingRefund(current, refundId);

      const externalRef = input.externalRef?.trim() || null;
      if (refund.method === REFUND_METHOD.BANK_TRANSFER && !externalRef) {
        throw conflict(RETURN_ERROR_CODE.REFUND_REFERENCE_REQUIRED, 'Nhập mã giao dịch ngân hàng trước khi xác nhận');
      }
      if (refund.method === REFUND_METHOD.CASH && input.cashHandedOver !== true) {
        throw conflict(RETURN_ERROR_CODE.REFUND_REFERENCE_REQUIRED, 'Xác nhận đã đưa tiền mặt cho khách');
      }
      if (externalRef) {
        const reused = await transaction.refund.findFirst({
          where: { method: refund.method, externalRef, id: { not: refund.id } },
          select: { refundNo: true },
        });
        if (reused) {
          throw conflict(RETURN_ERROR_CODE.REFUND_REFERENCE_USED, `Mã giao dịch đã dùng cho lượt hoàn ${reused.refundNo}`);
        }
      }

      const now = new Date();
      await transaction.refund.update({
        where: { id: refund.id },
        data: {
          status: REFUND_STATUS.SUCCEEDED,
          externalRef,
          processedBy: toDatabaseId(principal.userId),
          processedAt: now,
          version: { increment: 1 },
        },
      });

      const payment = current.order.payment!;
      const succeededOnReturn = this.sum(current.refunds, [REFUND_STATUS.SUCCEEDED]).add(refund.amount);
      const fullyRefundedReturn = current.refundCap !== null && succeededOnReturn.gte(current.refundCap);
      const succeededOnPayment = this.sum(payment.refunds, [REFUND_STATUS.SUCCEEDED]).add(refund.amount);
      if (succeededOnPayment.gte(payment.receivedAmount)) {
        // Payment không còn tiền nào của khách nằm lại cửa hàng; phản chiếu sang đơn để báo cáo và
        // worker hoàn tất đơn (chỉ nhận payment SUCCESS) không coi đơn này là doanh thu nữa.
        await transaction.payment.update({
          where: { id: payment.id },
          data: { status: PAYMENT_STATUS.REFUNDED, version: { increment: 1 } },
        });
        await transaction.order.update({
          where: { id: current.orderId },
          data: { paymentStatus: PAYMENT_STATUS.REFUNDED, version: { increment: 1 } },
        });
      }

      await this.store.appendHistory(transaction, current, {
        action: RETURN_ACTION.REFUND_CONFIRM,
        toStatus: fullyRefundedReturn ? RETURN_STATUS.REFUNDED : current.status,
        reason: `${refund.refundNo} ${refund.amount.toFixed(2)}${externalRef ? ` ref ${externalRef}` : ''}`,
        actor,
        requestId,
        intent,
      });
      await this.store.writeAudit(transaction, {
        returnId: current.id,
        action: 'return.refund.confirm',
        actor,
        requestId,
        before: { refundId: toEntityId(refund.id), status: refund.status },
        after: { status: REFUND_STATUS.SUCCEEDED, amount: refund.amount.toFixed(2), externalRef },
      });
      await this.store.notify(transaction, current, OUTBOX_EVENT_TYPE.REFUND_SUCCEEDED, {
        refundNo: refund.refundNo,
        amount: refund.amount.toFixed(2),
        method: refund.method,
      });
      return this.store.toDetail(await this.store.reload(transaction, current.id), false);
    });
  }

  /** Lượt hoàn không thực hiện được (sai số tài khoản, khách không tới nhận): trả lại phần tiền đã giữ. */
  async fail(
    id: string,
    refundId: string,
    input: ReturnReasonCommandDto,
    rawKey: string,
    requestId: string,
    principal: AuthPrincipal,
  ): Promise<ReturnDetailDto> {
    this.store.ensurePersistence();
    const actor: ReturnActor = { type: 'USER', principal };
    const returnId = toDatabaseId(id);
    const intent = this.store.intent(rawKey, RETURN_ACTION.REFUND_FAIL, `${id}:${refundId}`, input);
    return this.store.run(async (transaction) => {
      await this.store.lock(transaction, returnId);
      const current = await this.store.load(transaction, { id: returnId, AND: [this.store.scopeWhere(actor)] });
      const replay = this.store.replay(current, intent, false);
      if (replay) return replay;
      this.store.assertVersion(current, input.expectedVersion);
      assertTransition(current.status, RETURN_ACTION.REFUND_FAIL);
      const refund = this.pendingRefund(current, refundId);
      await transaction.refund.update({
        where: { id: refund.id },
        data: {
          status: REFUND_STATUS.FAILED,
          failureReason: input.reason,
          processedBy: toDatabaseId(principal.userId),
          processedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await this.store.appendHistory(transaction, current, {
        action: RETURN_ACTION.REFUND_FAIL,
        toStatus: current.status,
        reason: `${refund.refundNo}: ${input.reason}`,
        actor,
        requestId,
        intent,
      });
      await this.store.writeAudit(transaction, {
        returnId: current.id,
        action: 'return.refund.fail',
        actor,
        requestId,
        before: { refundId: toEntityId(refund.id), status: refund.status },
        after: { status: REFUND_STATUS.FAILED },
        reason: input.reason,
      });
      return this.store.toDetail(await this.store.reload(transaction, current.id), false);
    });
  }

  private pendingRefund(current: LoadedReturn, refundId: string): LoadedReturn['refunds'][number] {
    const refund = current.refunds.find((row) => toEntityId(row.id) === refundId);
    if (!refund) throw conflict(RETURN_ERROR_CODE.INVALID_TRANSITION, 'Lượt hoàn không thuộc phiếu trả này');
    if (refund.status !== REFUND_STATUS.PENDING) {
      throw conflict(RETURN_ERROR_CODE.INVALID_TRANSITION, `Lượt hoàn ${refund.refundNo} đã ở trạng thái ${refund.status}`);
    }
    return refund;
  }

  private remaining(current: LoadedReturn): Prisma.Decimal {
    const payment = current.order.payment!;
    return refundableRemaining({
      returnRefundCap: current.refundCap ?? ZERO,
      countedOnReturn: this.sum(current.refunds, REFUND_COUNTED_STATUSES),
      paymentReceivedAmount: payment.receivedAmount,
      countedOnPayment: this.sum(payment.refunds, REFUND_COUNTED_STATUSES),
    });
  }

  private sum(rows: { amount: Prisma.Decimal; status: string }[], statuses: readonly string[]): Prisma.Decimal {
    return rows.filter((row) => statuses.includes(row.status)).reduce((total, row) => total.add(row.amount), ZERO);
  }
}
