import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toDatabaseId, toEntityId } from '../../../common/identifiers/entity-id';
import { branchScopeWhere } from '../../../common/security/branch-scope';
import type { AuthPrincipal } from '../../auth/auth.types';
import { CHECKOUT_ITEM_TYPE } from '../../checkout/checkout.constants';
import { INVENTORY_MOVEMENT_TYPE, INVENTORY_REFERENCE_TYPE } from '../../inventory/inventory.constants';
import { OUTBOX_EVENT_TYPE } from '../../notification/notification.constants';
import { ORDER_STATUS } from '../../order/order.constants';
import { SYSTEM_PARAMETER_CODE } from '../../system/parameters/system-parameter.catalog';
import { SystemParameterService } from '../../system/parameters/system-parameter.service';
import type {
  AccountReturnQueryDto,
  AdminReturnQueryDto,
  ApproveReturnDto,
  CreateAccountReturnDto,
  CreateAdminReturnDto,
  InspectReturnDto,
  ReturnCommandDto,
  ReturnDetailDto,
  ReturnListDto,
  ReturnReasonCommandDto,
} from '../dto/return.dto';
import {
  REFUND_STATUS,
  RETURN_ACTION,
  RETURN_CHANNEL,
  RETURN_ERROR_CODE,
  RETURN_FAULT,
  RETURN_PERMISSION,
  RETURN_QUANTITY_RELEASED_STATUSES,
  RETURN_STATUS,
  RETURN_TERMINAL_STATUSES,
} from '../return.constants';
import {
  assertRequestedLines,
  assertTransition,
  isWithinReturnWindow,
  lineRefundCap,
  resolveInspection,
  returnRefundCap,
} from '../return.policy';
import { returnSummaryInclude, ReturnStore, type ReturnActor } from './return-store';

const returnableOrderInclude = {
  fulfillment: { select: { deliveredAt: true } },
  items: {
    orderBy: { lineNo: 'asc' as const },
    include: { components: { select: { componentVariantId: true } } },
  },
} satisfies Prisma.OrderInclude;

type ReturnableOrder = Prisma.OrderGetPayload<{ include: typeof returnableOrderInclude }>;

type CreateReturnInput = CreateAccountReturnDto | CreateAdminReturnDto;

const conflict = (code: string, message: string) => new ConflictException({ code, message });

/**
 * Use case của phiếu trả hàng (RMA): tạo, duyệt, từ chối, huỷ, nhận-kiểm hàng và đóng phiếu.
 * Hoàn tiền nằm ở `RefundService`; cả hai dùng chung khoá và replay qua `ReturnStore`.
 */
@Injectable()
export class ReturnService {
  constructor(
    private readonly store: ReturnStore,
    private readonly parameters: SystemParameterService,
  ) {}

  async listAccount(userId: string, query: AccountReturnQueryDto): Promise<ReturnListDto> {
    return this.list(this.store.scopeWhere({ type: 'CUSTOMER', userId }), query.page, query.limit);
  }

  async listAdmin(query: AdminReturnQueryDto, principal: AuthPrincipal): Promise<ReturnListDto> {
    const filters: Prisma.ReturnRequestWhereInput[] = [branchScopeWhere(principal, { strict: true })];
    if (query.status) filters.push({ status: query.status });
    if (query.search) {
      filters.push({
        OR: [
          { returnNo: { contains: query.search, mode: 'insensitive' } },
          { order: { orderNo: { contains: query.search, mode: 'insensitive' } } },
          { order: { addresses: { some: { recipientName: { contains: query.search, mode: 'insensitive' } } } } },
          { order: { addresses: { some: { recipientPhone: { contains: query.search, mode: 'insensitive' } } } } },
        ],
      });
    }
    return this.list({ AND: filters }, query.page, query.limit);
  }

  async getAccount(userId: string, returnNo: string): Promise<ReturnDetailDto> {
    this.store.ensurePersistence();
    const actor: ReturnActor = { type: 'CUSTOMER', userId };
    const found = await this.store.load(this.store.client, {
      returnNo: returnNo.trim().toUpperCase(),
      AND: [this.store.scopeWhere(actor)],
    });
    return this.store.toDetail(found, true);
  }

  async getAdmin(id: string, principal: AuthPrincipal): Promise<ReturnDetailDto> {
    this.store.ensurePersistence();
    const found = await this.store.load(this.store.client, {
      id: toDatabaseId(id),
      AND: [this.store.scopeWhere({ type: 'USER', principal })],
    });
    return this.store.toDetail(found, false);
  }

  async createAccount(
    userId: string,
    input: CreateAccountReturnDto,
    key: string,
    requestId: string,
  ): Promise<ReturnDetailDto> {
    this.store.ensurePersistence();
    const orderNo = input.orderNo.trim().toUpperCase();
    // SECURITY: chủ đơn xác định qua giỏ hàng của tài khoản, cùng quy tắc với xem/huỷ đơn.
    const order = await this.store.client.order.findFirst({
      where: { orderNo, checkoutSession: { cart: { userId: toDatabaseId(userId) } } },
      select: { id: true },
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng.');
    return this.create(order.id, input, key, requestId, { type: 'CUSTOMER', userId });
  }

  async createAdmin(
    input: CreateAdminReturnDto,
    key: string,
    requestId: string,
    principal: AuthPrincipal,
  ): Promise<ReturnDetailDto> {
    this.store.ensurePersistence();
    const order = await this.store.client.order.findFirst({
      where: { id: toDatabaseId(input.orderId), AND: [branchScopeWhere(principal, { strict: true })] },
      select: { id: true },
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng trong phạm vi được phân quyền');
    if (input.windowOverrideNote && !principal.permissions.includes(RETURN_PERMISSION.WINDOW_OVERRIDE)) {
      throw new ForbiddenException('Chỉ tài khoản có quyền override mới được nhận trả hàng quá hạn');
    }
    // D56: người có quyền duyệt tạo phiếu thì phiếu được duyệt luôn, nên phải chốt lỗi thuộc ai ngay.
    if (principal.permissions.includes(RETURN_PERMISSION.DECIDE) && !input.fault) {
      throw new BadRequestException('Chọn lỗi thuộc về shop hay khách: phiếu do bạn tạo sẽ được duyệt ngay');
    }
    return this.create(order.id, input, key, requestId, { type: 'USER', principal });
  }

  approve(id: string, input: ApproveReturnDto, key: string, requestId: string, principal: AuthPrincipal) {
    return this.decide(id, input, key, requestId, principal, RETURN_ACTION.APPROVE);
  }

  reject(id: string, input: ReturnReasonCommandDto, key: string, requestId: string, principal: AuthPrincipal) {
    return this.decide(id, input, key, requestId, principal, RETURN_ACTION.REJECT);
  }

  async cancelAccount(
    userId: string,
    returnNo: string,
    input: ReturnReasonCommandDto,
    key: string,
    requestId: string,
  ): Promise<ReturnDetailDto> {
    this.store.ensurePersistence();
    const actor: ReturnActor = { type: 'CUSTOMER', userId };
    const found = await this.store.load(this.store.client, {
      returnNo: returnNo.trim().toUpperCase(),
      AND: [this.store.scopeWhere(actor)],
    });
    return this.cancel(found.id, input, key, requestId, actor);
  }

  async cancelAdmin(
    id: string,
    input: ReturnReasonCommandDto,
    key: string,
    requestId: string,
    principal: AuthPrincipal,
  ): Promise<ReturnDetailDto> {
    this.store.ensurePersistence();
    return this.cancel(toDatabaseId(id), input, key, requestId, { type: 'USER', principal });
  }

  /**
   * Nhận hàng và kiểm từng dòng trong MỘT transaction.
   *
   * TRANSACTION: cập nhật phiếu, kết quả kiểm, tồn kho và movement cùng commit. Lỗi ở bất kỳ dòng nào
   * rollback toàn bộ để balance không lệch ledger. Trần tiền hoàn được chốt tại đây từ giá khách đã
   * trả, không tính lại lúc hoàn tiền: Admin sửa giá sản phẩm sau đó không làm đổi số tiền được hoàn.
   */
  async receive(
    id: string,
    input: InspectReturnDto,
    key: string,
    requestId: string,
    principal: AuthPrincipal,
  ): Promise<ReturnDetailDto> {
    this.store.ensurePersistence();
    const actor: ReturnActor = { type: 'USER', principal };
    const returnId = toDatabaseId(id);
    const intent = this.store.intent(key, RETURN_ACTION.RECEIVE, id, input);
    return this.store.run(async (transaction) => {
      await this.store.lock(transaction, returnId);
      const current = await this.store.load(transaction, { id: returnId, AND: [this.store.scopeWhere(actor)] });
      const replay = this.store.replay(current, intent, false);
      if (replay) return replay;
      this.store.assertVersion(current, input.expectedVersion);
      const nextStatus = assertTransition(current.status, RETURN_ACTION.RECEIVE);

      const inspections = new Map(input.items.map((item) => [item.returnItemId, item]));
      if (inspections.size !== input.items.length || inspections.size !== current.items.length) {
        throw conflict(RETURN_ERROR_CODE.INVALID_INSPECTION, 'Phải kiểm đủ và không lặp mọi dòng của phiếu trả');
      }

      const restockByVariant = new Map<bigint, number>();
      const lineCaps: Prisma.Decimal[] = [];
      const itemUpdates: Array<{ id: bigint; data: Prisma.ReturnItemUpdateInput }> = [];
      for (const item of current.items) {
        const inspection = inspections.get(toEntityId(item.id));
        if (!inspection) {
          throw conflict(RETURN_ERROR_CODE.INVALID_INSPECTION, `Thiếu kết quả kiểm cho ${item.orderItem.skuSnapshot}`);
        }
        const resolved = resolveInspection(inspection.condition, inspection.disposition);
        const cap = lineRefundCap(item.orderItem.lineTotal, item.orderItem.quantity, item.quantity, inspection.condition);
        lineCaps.push(cap);
        if (resolved.restock) {
          // Combo nhập lại theo từng thành phần vì tồn kho chỉ có ở cấp biến thể, không có tồn "combo".
          const units = item.orderItem.itemType === CHECKOUT_ITEM_TYPE.BUNDLE
            ? item.orderItem.components.map((component) => ({
                variantId: component.componentVariantId,
                quantity: component.quantityPerBundle * item.quantity,
              }))
            : [{ variantId: item.orderItem.productVariantId, quantity: item.quantity }];
          for (const unit of units) {
            restockByVariant.set(unit.variantId, (restockByVariant.get(unit.variantId) ?? 0) + unit.quantity);
          }
        }
        itemUpdates.push({
          id: item.id,
          data: {
            condition: inspection.condition,
            disposition: resolved.disposition,
            restockQty: resolved.restock ? item.quantity : 0,
            refundCap: cap,
            note: inspection.note ?? null,
          },
        });
      }

      const now = new Date();
      await this.restock(transaction, current.id, current.warehouseId, restockByVariant, intent.hash, input.note, principal, now);
      for (const update of itemUpdates) {
        await transaction.returnItem.update({ where: { id: update.id }, data: update.data });
      }

      const shippingAlreadyCovered = await transaction.returnRequest.count({
        where: {
          orderId: current.orderId,
          id: { not: current.id },
          fault: RETURN_FAULT.SHOP,
          status: { in: [RETURN_STATUS.RECEIVED, RETURN_STATUS.REFUNDED, RETURN_STATUS.CLOSED] },
        },
      });
      const refundCap = returnRefundCap(
        lineCaps,
        current.fault ?? RETURN_FAULT.CUSTOMER,
        current.order.shippingTotal,
        shippingAlreadyCovered > 0,
      );

      await this.store.appendHistory(transaction, current, {
        action: RETURN_ACTION.RECEIVE,
        toStatus: nextStatus,
        reason: input.note,
        actor,
        requestId,
        intent,
        patch: { receivedBy: toDatabaseId(principal.userId), receivedAt: now, refundCap },
      });
      await this.store.writeAudit(transaction, {
        returnId: current.id,
        action: 'return.receive',
        actor,
        requestId,
        before: { status: current.status, version: current.version.toString() },
        after: {
          status: nextStatus,
          refundCap: refundCap.toFixed(2),
          restocked: [...restockByVariant].map(([variantId, quantity]) => ({ variantId: toEntityId(variantId), quantity })),
        },
        reason: input.note,
      });
      return this.store.toDetail(await this.store.reload(transaction, current.id), false);
    });
  }

  async close(
    id: string,
    input: ReturnCommandDto,
    key: string,
    requestId: string,
    principal: AuthPrincipal,
  ): Promise<ReturnDetailDto> {
    this.store.ensurePersistence();
    const actor: ReturnActor = { type: 'USER', principal };
    const returnId = toDatabaseId(id);
    const intent = this.store.intent(key, RETURN_ACTION.CLOSE, id, input);
    return this.store.run(async (transaction) => {
      await this.store.lock(transaction, returnId);
      const current = await this.store.load(transaction, { id: returnId, AND: [this.store.scopeWhere(actor)] });
      const replay = this.store.replay(current, intent, false);
      if (replay) return replay;
      this.store.assertVersion(current, input.expectedVersion);
      const nextStatus = assertTransition(current.status, RETURN_ACTION.CLOSE);
      if (current.refunds.some((refund) => refund.status === REFUND_STATUS.PENDING)) {
        throw conflict(RETURN_ERROR_CODE.REFUND_PENDING_EXISTS, 'Còn lượt hoàn tiền chờ xác nhận; xác nhận hoặc đánh lỗi trước khi đóng');
      }
      await this.store.appendHistory(transaction, current, {
        action: RETURN_ACTION.CLOSE,
        toStatus: nextStatus,
        reason: input.note,
        actor,
        requestId,
        intent,
        patch: { closedAt: new Date() },
      });
      await this.store.writeAudit(transaction, {
        returnId: current.id,
        action: 'return.close',
        actor,
        requestId,
        before: { status: current.status, version: current.version.toString() },
        after: { status: nextStatus },
        reason: input.note,
      });
      return this.store.toDetail(await this.store.reload(transaction, current.id), false);
    });
  }

  private async list(where: Prisma.ReturnRequestWhereInput, page: number, limit: number): Promise<ReturnListDto> {
    this.store.ensurePersistence();
    const [rows, total] = await Promise.all([
      this.store.client.returnRequest.findMany({
        where,
        include: returnSummaryInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.store.client.returnRequest.count({ where }),
    ]);
    return { items: rows.map((row) => this.store.toSummary(row)), page, limit, total };
  }

  /**
   * Tạo phiếu trả.
   *
   * IDEMPOTENCY: khoá nằm trên chính `return_requests.idempotency_key` (phiếu chưa tồn tại nên chưa có
   * lịch sử để chứa khoá). Replay kiểm cả hash lẫn phạm vi: khoá của người khác không đọc được phiếu.
   * TRANSACTION: khoá dòng đơn để hai yêu cầu song song cùng đơn không cùng vượt qua kiểm tra số lượng.
   */
  private async create(
    orderId: bigint,
    input: CreateReturnInput,
    rawKey: string,
    requestId: string,
    actor: ReturnActor,
  ): Promise<ReturnDetailDto> {
    const intent = this.store.intent(rawKey, RETURN_ACTION.CREATE, toEntityId(orderId), {
      actor: actor.type === 'CUSTOMER' ? `customer:${actor.userId}` : `user:${actor.principal.userId}`,
      input,
    });
    const forCustomer = actor.type === 'CUSTOMER';
    const windowDays = await this.parameters.getInteger(SYSTEM_PARAMETER_CODE.RETURN_WINDOW_DAYS);

    return this.store.run(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`);
      const existing = await transaction.returnRequest.findUnique({ where: { idempotencyKey: intent.key } });
      if (existing) {
        if (existing.requestHash !== intent.hash) throw this.store.idempotencyConflict();
        const visible = await this.store.load(transaction, { id: existing.id, AND: [this.store.scopeWhere(actor)] });
        return this.store.toDetail(visible, forCustomer);
      }

      const order = await transaction.order.findUniqueOrThrow({ where: { id: orderId }, include: returnableOrderInclude });
      const now = new Date();
      const deliveredAt = this.assertOrderReturnable(order);
      const override = this.resolveWindow(deliveredAt, now, windowDays, input, actor);
      await this.assertNoOpenReturn(transaction, order.id);
      await this.assertLines(transaction, order, input.items);
      await this.assertCategoriesReturnable(transaction, order, input.items);

      const autoApprove =
        actor.type === 'USER' && actor.principal.permissions.includes(RETURN_PERMISSION.DECIDE);
      const fault = 'fault' in input ? input.fault : undefined;
      const actorColumns = this.store.actorColumns(actor);
      const created = await transaction.returnRequest.create({
        data: {
          // Mã tạm duy nhất theo khoá, đổi sang RMA-<ngày>-<id> ngay sau khi có id.
          returnNo: `TMP-${createHash('sha256').update(intent.key).digest('hex').slice(0, 24)}`,
          orderId: order.id,
          customerId: order.customerId,
          branchId: order.branchId,
          warehouseId: order.warehouseId,
          status: RETURN_STATUS.REQUESTED,
          channel: forCustomer ? RETURN_CHANNEL.ACCOUNT : RETURN_CHANNEL.ADMIN,
          reasonCode: input.reasonCode,
          description: input.description ?? null,
          evidenceUrls: input.evidenceUrls ?? undefined,
          deliveredAt,
          windowOverrideBy: override ? actorColumns.actorId : null,
          windowOverrideNote: override ?? null,
          idempotencyKey: intent.key,
          requestHash: intent.hash,
          createdBy: actorColumns.actorId,
          items: {
            create: input.items.map((line) => ({ orderItemId: toDatabaseId(line.orderItemId), quantity: line.quantity })),
          },
          history: {
            create: {
              sequenceNo: 1,
              action: RETURN_ACTION.CREATE,
              fromStatus: null,
              toStatus: RETURN_STATUS.REQUESTED,
              reason: override ? `Nhận trả quá hạn: ${override}` : null,
              ...actorColumns,
              requestId,
            },
          },
        },
      });
      await transaction.returnRequest.update({
        where: { id: created.id },
        data: { returnNo: this.store.documentNo('RMA', created.id, now) },
      });
      await this.store.writeAudit(transaction, {
        returnId: created.id,
        action: 'return.create',
        actor,
        requestId,
        after: {
          orderId: toEntityId(order.id),
          reasonCode: input.reasonCode,
          items: input.items.map((line) => ({ orderItemId: line.orderItemId, quantity: line.quantity })),
          windowOverridden: Boolean(override),
        },
        reason: override,
      });

      if (autoApprove && fault) {
        const loaded = await this.store.reload(transaction, created.id);
        await this.applyDecision(transaction, loaded, RETURN_ACTION.APPROVE, fault, 'Duyệt ngay khi tạo (D56)', actor, requestId);
      }
      return this.store.toDetail(await this.store.reload(transaction, created.id), forCustomer);
    });
  }

  private assertOrderReturnable(order: ReturnableOrder): Date {
    const statusAllowsReturn = order.status === ORDER_STATUS.DELIVERED || order.status === ORDER_STATUS.COMPLETED;
    const deliveredAt = order.fulfillment?.deliveredAt;
    if (!statusAllowsReturn || !deliveredAt) {
      throw conflict(RETURN_ERROR_CODE.ORDER_NOT_RETURNABLE, 'Chỉ tạo phiếu trả cho đơn đã giao thành công');
    }
    return deliveredAt;
  }

  /**
   * D54 + override: quá hạn chỉ được nhận khi Admin có quyền override và ghi lý do. Trong hạn thì
   * không lưu ghi chú override, để cờ `windowOverridden` chỉ bật khi thật sự có ngoại lệ.
   */
  private resolveWindow(
    deliveredAt: Date,
    now: Date,
    windowDays: number,
    input: CreateReturnInput,
    actor: ReturnActor,
  ): string | undefined {
    if (isWithinReturnWindow(deliveredAt, now, windowDays)) return undefined;
    const note = 'windowOverrideNote' in input ? input.windowOverrideNote : undefined;
    const canOverride =
      actor.type === 'USER' && actor.principal.permissions.includes(RETURN_PERMISSION.WINDOW_OVERRIDE);
    if (!note || !canOverride) {
      throw conflict(RETURN_ERROR_CODE.WINDOW_EXPIRED, `Đơn đã quá hạn đổi trả ${windowDays} ngày kể từ khi giao`);
    }
    return note;
  }

  private async assertNoOpenReturn(transaction: Prisma.TransactionClient, orderId: bigint): Promise<void> {
    const open = await transaction.returnRequest.findFirst({
      where: { orderId, status: { notIn: [...RETURN_TERMINAL_STATUSES] } },
      select: { returnNo: true },
    });
    if (open) {
      throw conflict(RETURN_ERROR_CODE.OPEN_RETURN_EXISTS, `Đơn đang có phiếu trả ${open.returnNo} chưa xử lý xong`);
    }
  }

  private async assertLines(
    transaction: Prisma.TransactionClient,
    order: ReturnableOrder,
    lines: CreateReturnInput['items'],
  ): Promise<void> {
    const itemsById = new Map(order.items.map((item) => [toEntityId(item.id), item]));
    const unknown = lines.find((line) => !itemsById.has(line.orderItemId));
    if (unknown) throw new BadRequestException('Sản phẩm trả không thuộc đơn hàng này');

    const returned = await transaction.returnItem.groupBy({
      by: ['orderItemId'],
      where: {
        orderItemId: { in: lines.map((line) => toDatabaseId(line.orderItemId)) },
        returnRequest: { status: { notIn: [...RETURN_QUANTITY_RELEASED_STATUSES] } },
      },
      _sum: { quantity: true },
    });
    const returnedById = new Map(returned.map((row) => [toEntityId(row.orderItemId), row._sum.quantity ?? 0]));
    assertRequestedLines(
      lines.map((line) => {
        const item = itemsById.get(line.orderItemId)!;
        return {
          orderItemId: line.orderItemId,
          quantity: line.quantity,
          purchasedQuantity: item.quantity,
          alreadyReturnedQuantity: returnedById.get(line.orderItemId) ?? 0,
          isBundle: item.itemType === CHECKOUT_ITEM_TYPE.BUNDLE,
          label: item.skuSnapshot,
        };
      }),
    );
  }

  /**
   * D54: sản phẩm thuộc bất kỳ danh mục nào tắt `returnable` thì không trả được. Combo xét cả biến thể
   * thành phần: một combo chứa hàng không được trả thì cũng không trả được.
   */
  private async assertCategoriesReturnable(
    transaction: Prisma.TransactionClient,
    order: ReturnableOrder,
    lines: CreateReturnInput['items'],
  ): Promise<void> {
    const requested = new Set(lines.map((line) => line.orderItemId));
    const variantIds = order.items
      .filter((item) => requested.has(toEntityId(item.id)))
      .flatMap((item) => [item.productVariantId, ...item.components.map((component) => component.componentVariantId)]);
    const blocked = await transaction.productVariant.findFirst({
      where: {
        id: { in: variantIds },
        product: { categories: { some: { category: { returnable: false } } } },
      },
      select: { sku: true },
    });
    if (blocked) {
      throw conflict(RETURN_ERROR_CODE.ITEM_NOT_RETURNABLE, `${blocked.sku} thuộc danh mục không áp dụng đổi trả`);
    }
  }

  private async decide(
    id: string,
    input: ApproveReturnDto | ReturnReasonCommandDto,
    key: string,
    requestId: string,
    principal: AuthPrincipal,
    action: typeof RETURN_ACTION.APPROVE | typeof RETURN_ACTION.REJECT,
  ): Promise<ReturnDetailDto> {
    this.store.ensurePersistence();
    const actor: ReturnActor = { type: 'USER', principal };
    const returnId = toDatabaseId(id);
    const intent = this.store.intent(key, action, id, input);
    return this.store.run(async (transaction) => {
      await this.store.lock(transaction, returnId);
      const current = await this.store.load(transaction, { id: returnId, AND: [this.store.scopeWhere(actor)] });
      const replay = this.store.replay(current, intent, false);
      if (replay) return replay;
      this.store.assertVersion(current, input.expectedVersion);
      const fault = 'fault' in input ? input.fault : undefined;
      const note = 'reason' in input ? input.reason : input.note;
      await this.applyDecision(transaction, current, action, fault, note, actor, requestId, intent);
      return this.store.toDetail(await this.store.reload(transaction, current.id), false);
    });
  }

  private async applyDecision(
    transaction: Prisma.TransactionClient,
    current: Awaited<ReturnType<ReturnStore['load']>>,
    action: typeof RETURN_ACTION.APPROVE | typeof RETURN_ACTION.REJECT,
    fault: string | undefined,
    note: string | undefined,
    actor: ReturnActor,
    requestId: string,
    intent?: ReturnType<ReturnStore['intent']>,
  ): Promise<void> {
    const nextStatus = assertTransition(current.status, action);
    const actorId = this.store.actorColumns(actor).actorId;
    await this.store.appendHistory(transaction, current, {
      action,
      toStatus: nextStatus,
      reason: note,
      actor,
      requestId,
      intent,
      patch: {
        ...(fault ? { fault } : {}),
        decidedBy: actorId,
        decidedAt: new Date(),
        decisionNote: note?.trim() || null,
      },
    });
    await this.store.writeAudit(transaction, {
      returnId: current.id,
      action: action === RETURN_ACTION.APPROVE ? 'return.approve' : 'return.reject',
      actor,
      requestId,
      before: { status: current.status, version: current.version.toString() },
      after: { status: nextStatus, fault: fault ?? null },
      reason: note,
    });
    await this.store.notify(transaction, current, OUTBOX_EVENT_TYPE.RETURN_DECIDED, {
      approved: action === RETURN_ACTION.APPROVE,
      note: note?.trim() || null,
    });
  }

  private async cancel(
    returnId: bigint,
    input: ReturnReasonCommandDto,
    key: string,
    requestId: string,
    actor: ReturnActor,
  ): Promise<ReturnDetailDto> {
    const forCustomer = actor.type === 'CUSTOMER';
    const intent = this.store.intent(key, RETURN_ACTION.CANCEL, toEntityId(returnId), input);
    return this.store.run(async (transaction) => {
      await this.store.lock(transaction, returnId);
      const current = await this.store.load(transaction, { id: returnId, AND: [this.store.scopeWhere(actor)] });
      const replay = this.store.replay(current, intent, forCustomer);
      if (replay) return replay;
      this.store.assertVersion(current, input.expectedVersion);
      const nextStatus = assertTransition(current.status, RETURN_ACTION.CANCEL);
      await this.store.appendHistory(transaction, current, {
        action: RETURN_ACTION.CANCEL,
        toStatus: nextStatus,
        reason: input.reason,
        actor,
        requestId,
        intent,
        patch: { closedAt: new Date() },
      });
      await this.store.writeAudit(transaction, {
        returnId: current.id,
        action: 'return.cancel',
        actor,
        requestId,
        before: { status: current.status, version: current.version.toString() },
        after: { status: nextStatus },
        reason: input.reason,
      });
      return this.store.toDetail(await this.store.reload(transaction, current.id), forCustomer);
    });
  }

  /**
   * INVARIANT: chỉ hàng SELLABLE tăng `on_hand`, về đúng kho đã xuất đơn. Mỗi biến thể một movement
   * `RETURN_RESTOCK`; khoá movement gồm hash lệnh nên replay không nhập kho lần hai.
   */
  private async restock(
    transaction: Prisma.TransactionClient,
    returnId: bigint,
    warehouseId: bigint,
    quantities: Map<bigint, number>,
    intentHash: string,
    note: string | undefined,
    principal: AuthPrincipal,
    now: Date,
  ): Promise<void> {
    if (quantities.size === 0) return;
    const variantIds = [...quantities.keys()].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
    await transaction.$queryRaw(Prisma.sql`
      SELECT id FROM inventory_balances
      WHERE warehouse_id = ${warehouseId}
        AND product_variant_id IN (${Prisma.join(variantIds)})
      ORDER BY product_variant_id FOR UPDATE
    `);
    const balances = await transaction.inventoryBalance.findMany({
      where: { warehouseId, productVariantId: { in: variantIds } },
    });
    const balanceByVariant = new Map(balances.map((balance) => [balance.productVariantId, balance]));
    for (const variantId of variantIds) {
      const quantity = quantities.get(variantId)!;
      const balance = balanceByVariant.get(variantId);
      if (!balance) throw new ConflictException('Không tìm thấy số dư kho để nhập lại hàng trả');
      await transaction.inventoryBalance.update({
        where: { id: balance.id },
        data: { onHand: { increment: quantity }, version: { increment: 1 } },
      });
      await transaction.inventoryMovement.create({
        data: {
          warehouseId,
          productVariantId: variantId,
          movementType: INVENTORY_MOVEMENT_TYPE.RETURN_RESTOCK,
          quantityDelta: quantity,
          balanceAfter: balance.onHand + quantity,
          referenceType: INVENTORY_REFERENCE_TYPE.RETURN_REQUEST,
          referenceId: toEntityId(returnId),
          idempotencyKey: `return-restock:${returnId}:${variantId}:${intentHash}`,
          reason: note?.trim() || 'Nhập lại hàng khách trả',
          occurredAt: now,
          createdBy: toDatabaseId(principal.userId),
        },
      });
    }
  }
}
