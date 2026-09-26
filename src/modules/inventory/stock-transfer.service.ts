import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toDatabaseId, toEntityId } from '../../common/identifiers/entity-id';
import { PrismaService } from '../../database/prisma.service';
import { AuditWriter } from '../audit/audit.writer';
import type { AuthPrincipal } from '../auth/auth.types';
import { ScopeType } from '../iam/iam.types';
import { INVENTORY_MOVEMENT_TYPE, INVENTORY_REFERENCE_TYPE, INVENTORY_ERROR } from './inventory.constants';
import {
  CancelStockTransferDto,
  CreateStockTransferDto,
  ReceiveStockTransferDto,
  StockTransferDetailDto,
  StockTransferTransitionDto,
  UpdateStockTransferDto,
} from './stock-transfer.dto';
import { mapStockTransferDetail, stockTransferInclude, type StockTransferRecord } from './stock-transfer.mapper';
import { STOCK_TRANSFER_STATUS, STOCK_TRANSFER_ERROR } from './stock-transfer.constants';

const TRANSFER_AUDIT_ACTION = {
  CREATE: 'inventory.stock_transfer.create',
  UPDATE: 'inventory.stock_transfer.update',
  CANCEL: 'inventory.stock_transfer.cancel',
  SUBMIT: 'inventory.stock_transfer.submit',
  SHIP: 'inventory.stock_transfer.ship',
  RECEIVE: 'inventory.stock_transfer.receive',
} as const;

@Injectable()
export class StockTransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
  ) {}

  async create(
    input: CreateStockTransferDto,
    idempotencyKey: string,
    principal: AuthPrincipal,
    requestId: string,
  ): Promise<StockTransferDetailDto> {
    this.ensurePersistence();
    const key = this.requireIdempotencyKey(idempotencyKey);
    this.assertUniqueSkus(input.items.map(({ sku }) => sku));
    const requestHash = this.createRequestHash(input);
    const existing = await this.prisma.stockTransfer.findUnique({
      where: { idempotencyKey: key }, include: stockTransferInclude,
    });
    if (existing) return this.replayCreate(existing, requestHash);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const codes = [input.fromWarehouseCode, input.toWarehouseCode]
          .map((code) => code.trim().toUpperCase());
        if (codes[0] === codes[1]) throw new BadRequestException(STOCK_TRANSFER_ERROR.SAME_WAREHOUSE);
        const warehouses = await transaction.warehouse.findMany({
          where: { code: { in: codes }, status: 'ACTIVE' },
        });
        const source = warehouses.find(({ code }) => code === codes[0]);
        const destination = warehouses.find(({ code }) => code === codes[1]);
        if (!source || !destination) throw new BadRequestException(STOCK_TRANSFER_ERROR.WAREHOUSE_INACTIVE);
        this.assertBranchScope(principal, source.branchId, 'source');

        const itemRows = await this.resolveItems(transaction, input.items);
        const transferNo = this.transferNo();
        const transfer = await transaction.stockTransfer.create({
          data: {
            transferNo,
            fromWarehouseId: source.id,
            toWarehouseId: destination.id,
            reason: input.reason.trim(),
            idempotencyKey: key,
            requestHash,
            createdBy: toDatabaseId(principal.userId),
            items: { create: itemRows },
          },
          include: stockTransferInclude,
        });
        await this.writeAudit(transaction, requestId, principal, TRANSFER_AUDIT_ACTION.CREATE, transfer, input.reason);
        return mapStockTransferDetail(transfer);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await this.prisma.stockTransfer.findUnique({
          where: { idempotencyKey: key }, include: stockTransferInclude,
        });
        if (raced) return this.replayCreate(raced, requestHash);
      }
      this.rethrowConcurrency(error);
    }
  }

  /**
   * Sửa phiếu nháp tạo nhầm: lý do và/hoặc thay toàn bộ danh sách hàng.
   *
   * INVARIANT: chỉ DRAFT. Từ SUBMITTED trở đi phiếu đã được gửi duyệt/xuất, sửa lặng lẽ sẽ làm người
   * duyệt thấy một phiếu khác với phiếu họ đã xem; muốn đổi thì huỷ rồi tạo phiếu mới.
   * Không cần Idempotency-Key: lệnh không đụng tồn kho, `version` đã chặn ghi đè lẫn nhau.
   */
  async update(
    id: string,
    input: UpdateStockTransferDto,
    principal: AuthPrincipal,
    requestId: string,
  ): Promise<StockTransferDetailDto> {
    this.ensurePersistence();
    const reason = input.reason?.trim();
    if (!reason && !input.items) throw new BadRequestException(STOCK_TRANSFER_ERROR.UPDATE_EMPTY);
    if (input.items) this.assertUniqueSkus(input.items.map(({ sku }) => sku));
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const transfer = await this.lockTransfer(transaction, id);
        this.assertBranchScope(principal, transfer.fromWarehouse.branchId, 'source');
        if (transfer.status !== STOCK_TRANSFER_STATUS.DRAFT) {
          throw new ConflictException(STOCK_TRANSFER_ERROR.UPDATE_REQUIRES_DRAFT);
        }
        this.assertVersion(transfer.version, input.version);
        if (input.items) {
          const itemRows = await this.resolveItems(transaction, input.items);
          await transaction.stockTransferItem.deleteMany({ where: { stockTransferId: transfer.id } });
          await transaction.stockTransferItem.createMany({
            data: itemRows.map((row) => ({ ...row, stockTransferId: transfer.id })),
          });
        }
        const updated = await transaction.stockTransfer.update({
          where: { id: transfer.id },
          data: { ...(reason ? { reason } : {}), version: { increment: 1 } },
          include: stockTransferInclude,
        });
        await this.writeAudit(
          transaction, requestId, principal, TRANSFER_AUDIT_ACTION.UPDATE, updated, reason ?? transfer.reason, transfer,
        );
        return mapStockTransferDetail(updated);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      this.rethrowConcurrency(error);
    }
  }

  /**
   * Huỷ phiếu DRAFT hoặc từ chối phiếu SUBMITTED.
   *
   * INVARIANT: submit chưa giữ/trừ tồn nên huỷ không phát sinh movement nào. Sau SHIPPED hàng đã rời
   * kho xuất: huỷ lúc đó sẽ làm mất dấu hàng đang trên đường, nên chặn và yêu cầu nhận rồi điều chỉnh bù.
   * Phiếu đã CANCELLED thì trả lại trạng thái hiện tại (retry an toàn) như các transition khác.
   */
  async cancel(
    id: string,
    input: CancelStockTransferDto,
    principal: AuthPrincipal,
    requestId: string,
  ): Promise<StockTransferDetailDto> {
    this.ensurePersistence();
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const transfer = await this.lockTransfer(transaction, id);
        this.assertBranchScope(principal, transfer.fromWarehouse.branchId, 'source');
        if (transfer.status === STOCK_TRANSFER_STATUS.CANCELLED) return mapStockTransferDetail(transfer);
        if (transfer.status !== STOCK_TRANSFER_STATUS.DRAFT && transfer.status !== STOCK_TRANSFER_STATUS.SUBMITTED) {
          throw new ConflictException(STOCK_TRANSFER_ERROR.CANCEL_AFTER_SHIPPED);
        }
        this.assertVersion(transfer.version, input.version);
        const reason = input.reason.trim();
        const updated = await transaction.stockTransfer.update({
          where: { id: transfer.id },
          data: {
            status: STOCK_TRANSFER_STATUS.CANCELLED,
            cancelledAt: new Date(),
            cancelledBy: toDatabaseId(principal.userId),
            cancelReason: reason,
            version: { increment: 1 },
          },
          include: stockTransferInclude,
        });
        await this.writeAudit(transaction, requestId, principal, TRANSFER_AUDIT_ACTION.CANCEL, updated, reason, transfer);
        return mapStockTransferDetail(updated);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      this.rethrowConcurrency(error);
    }
  }

  submit(id: string, input: StockTransferTransitionDto, principal: AuthPrincipal, requestId: string) {
    return this.transition(id, input.version, principal, requestId, STOCK_TRANSFER_STATUS.SUBMITTED);
  }

  ship(id: string, input: StockTransferTransitionDto, principal: AuthPrincipal, requestId: string) {
    return this.transition(id, input.version, principal, requestId, STOCK_TRANSFER_STATUS.SHIPPED);
  }

  async receive(
    id: string,
    input: ReceiveStockTransferDto,
    principal: AuthPrincipal,
    requestId: string,
  ): Promise<StockTransferDetailDto> {
    this.ensurePersistence();
    this.assertUniqueSkus(input.items.map(({ sku }) => sku));
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const transfer = await this.lockTransfer(transaction, id);
        this.assertBranchScope(principal, transfer.toWarehouse.branchId, 'destination');
        if (transfer.status === STOCK_TRANSFER_STATUS.RECEIVED) {
          this.assertReceiveReplay(transfer, input);
          return mapStockTransferDetail(transfer);
        }
        if (transfer.status !== STOCK_TRANSFER_STATUS.SHIPPED) {
          throw new ConflictException(STOCK_TRANSFER_ERROR.RECEIVE_REQUIRES_SHIPPED);
        }
        this.assertVersion(transfer.version, input.version);
        const receivedBySku = new Map(input.items.map((item) => [item.sku.trim().toUpperCase(), item]));
        if (receivedBySku.size !== transfer.items.length) {
          throw new BadRequestException(STOCK_TRANSFER_ERROR.RECEIVE_ITEMS_MISMATCH);
        }
        for (const item of transfer.items) {
          const received = receivedBySku.get(item.productVariant.sku);
          if (!received) throw new BadRequestException(STOCK_TRANSFER_ERROR.RECEIVE_ITEM_MISSING(item.productVariant.sku));
          if (received.receivedQuantity + received.damagedQuantity !== item.shippedQty) {
            throw new BadRequestException(STOCK_TRANSFER_ERROR.RECEIVE_QUANTITY_MISMATCH(item.productVariant.sku));
          }
          if (received.damagedQuantity > 0 && !received.damageReason?.trim()) {
            throw new BadRequestException(STOCK_TRANSFER_ERROR.DAMAGE_REASON_REQUIRED(item.productVariant.sku));
          }
          if (received.damagedQuantity === 0 && received.damageReason?.trim()) {
            throw new BadRequestException(STOCK_TRANSFER_ERROR.DAMAGE_REASON_NOT_ALLOWED(item.productVariant.sku));
          }
        }

        const sellableItems = transfer.items.filter((item) => receivedBySku.get(item.productVariant.sku)!.receivedQuantity > 0);
        await transaction.inventoryBalance.createMany({
          data: sellableItems.map((item) => ({
            warehouseId: transfer.toWarehouseId,
            productVariantId: item.productVariantId,
          })),
          skipDuplicates: true,
        });
        const variantIds = sellableItems.map(({ productVariantId }) => productVariantId)
          .sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
        if (variantIds.length > 0) await this.lockBalances(transaction, transfer.toWarehouseId, variantIds);
        const balances = await transaction.inventoryBalance.findMany({
          where: { warehouseId: transfer.toWarehouseId, productVariantId: { in: variantIds } },
        });
        const byVariant = new Map(balances.map((balance) => [balance.productVariantId, balance]));
        const now = new Date();
        for (const item of transfer.items) {
          const received = receivedBySku.get(item.productVariant.sku)!;
          await transaction.stockTransferItem.update({
            where: { id: item.id },
            data: {
              receivedQty: received.receivedQuantity,
              damagedQty: received.damagedQuantity,
              damageReason: received.damageReason?.trim() || null,
            },
          });
          if (received.receivedQuantity === 0) continue;
          const balance = byVariant.get(item.productVariantId)!;
          const nextOnHand = balance.onHand + received.receivedQuantity;
          await this.updateBalance(transaction, balance.id, balance.version, nextOnHand);
          await transaction.inventoryMovement.create({ data: {
            warehouseId: transfer.toWarehouseId,
            productVariantId: item.productVariantId,
            movementType: INVENTORY_MOVEMENT_TYPE.TRANSFER_IN,
            quantityDelta: received.receivedQuantity,
            balanceAfter: nextOnHand,
            referenceType: INVENTORY_REFERENCE_TYPE.STOCK_TRANSFER,
            referenceId: toEntityId(transfer.id),
            idempotencyKey: `transfer:${transfer.id}:receive:${item.productVariantId}`,
            reason: transfer.reason,
            occurredAt: now,
            createdBy: toDatabaseId(principal.userId),
          } });
        }
        const updated = await transaction.stockTransfer.update({
          where: { id: transfer.id },
          data: {
            status: STOCK_TRANSFER_STATUS.RECEIVED,
            receivedAt: now,
            receivedBy: toDatabaseId(principal.userId),
            version: { increment: 1 },
          },
          include: stockTransferInclude,
        });
        await this.writeAudit(transaction, requestId, principal, TRANSFER_AUDIT_ACTION.RECEIVE, updated, transfer.reason);
        return mapStockTransferDetail(updated);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      this.rethrowConcurrency(error);
    }
  }

  private async transition(
    id: string,
    version: string,
    principal: AuthPrincipal,
    requestId: string,
    target: typeof STOCK_TRANSFER_STATUS.SUBMITTED | typeof STOCK_TRANSFER_STATUS.SHIPPED,
  ): Promise<StockTransferDetailDto> {
    this.ensurePersistence();
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const transfer = await this.lockTransfer(transaction, id);
        this.assertBranchScope(principal, transfer.fromWarehouse.branchId, 'source');
        const expected = target === STOCK_TRANSFER_STATUS.SUBMITTED
          ? STOCK_TRANSFER_STATUS.DRAFT : STOCK_TRANSFER_STATUS.SUBMITTED;
        const alreadyReached = target === STOCK_TRANSFER_STATUS.SUBMITTED
          ? transfer.status !== STOCK_TRANSFER_STATUS.DRAFT
          : transfer.status === STOCK_TRANSFER_STATUS.SHIPPED
            || transfer.status === STOCK_TRANSFER_STATUS.RECEIVED;
        if (alreadyReached) return mapStockTransferDetail(transfer);
        if (transfer.status !== expected) throw new ConflictException(STOCK_TRANSFER_ERROR.INVALID_STATUS(expected, target));
        this.assertVersion(transfer.version, version);
        const now = new Date();
        if (target === STOCK_TRANSFER_STATUS.SHIPPED) {
          await this.shipInventory(transaction, transfer, principal, now);
        }
        const updated = await transaction.stockTransfer.update({
          where: { id: transfer.id },
          data: target === STOCK_TRANSFER_STATUS.SUBMITTED
            ? { status: target, submittedAt: now, version: { increment: 1 } }
            : { status: target, shippedAt: now, shippedBy: toDatabaseId(principal.userId), version: { increment: 1 } },
          include: stockTransferInclude,
        });
        await this.writeAudit(
          transaction,
          requestId,
          principal,
          target === STOCK_TRANSFER_STATUS.SUBMITTED ? TRANSFER_AUDIT_ACTION.SUBMIT : TRANSFER_AUDIT_ACTION.SHIP,
          updated,
          transfer.reason,
        );
        return mapStockTransferDetail(updated);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      this.rethrowConcurrency(error);
    }
  }

  private async shipInventory(
    transaction: Prisma.TransactionClient,
    transfer: StockTransferRecord,
    principal: AuthPrincipal,
    now: Date,
  ): Promise<void> {
    const variantIds = transfer.items.map(({ productVariantId }) => productVariantId)
      .sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
    await this.lockBalances(transaction, transfer.fromWarehouseId, variantIds);
    const balances = await transaction.inventoryBalance.findMany({
      where: { warehouseId: transfer.fromWarehouseId, productVariantId: { in: variantIds } },
    });
    const byVariant = new Map(balances.map((balance) => [balance.productVariantId, balance]));
    for (const item of transfer.items) {
      const balance = byVariant.get(item.productVariantId);
      if (!balance || balance.onHand - balance.reserved < item.requestedQty) {
        throw new ConflictException(STOCK_TRANSFER_ERROR.INSUFFICIENT_STOCK(item.productVariant.sku));
      }
      const nextOnHand = balance.onHand - item.requestedQty;
      await this.updateBalance(transaction, balance.id, balance.version, nextOnHand);
      await transaction.stockTransferItem.update({
        where: { id: item.id }, data: { shippedQty: item.requestedQty },
      });
      await transaction.inventoryMovement.create({ data: {
        warehouseId: transfer.fromWarehouseId,
        productVariantId: item.productVariantId,
        movementType: INVENTORY_MOVEMENT_TYPE.TRANSFER_OUT,
        quantityDelta: -item.requestedQty,
        balanceAfter: nextOnHand,
        referenceType: INVENTORY_REFERENCE_TYPE.STOCK_TRANSFER,
        referenceId: toEntityId(transfer.id),
        idempotencyKey: `transfer:${transfer.id}:ship:${item.productVariantId}`,
        reason: transfer.reason,
        occurredAt: now,
        createdBy: toDatabaseId(principal.userId),
      } });
    }
  }

  /** SKU thường đang bán → dòng phiếu; dùng chung cho tạo và sửa phiếu để cùng một luật chọn hàng. */
  private async resolveItems(
    transaction: Prisma.TransactionClient,
    items: Array<{ sku: string; requestedQuantity: number }>,
  ): Promise<Array<{ productVariantId: bigint; requestedQty: number }>> {
    const skus = items.map(({ sku }) => sku.trim().toUpperCase()).sort();
    const variants = await transaction.productVariant.findMany({
      where: { sku: { in: skus }, status: 'ACTIVE', product: { productType: 'STANDARD' } },
      include: { product: true },
    });
    if (variants.length !== skus.length) {
      const found = new Set(variants.map(({ sku }) => sku));
      throw new BadRequestException(STOCK_TRANSFER_ERROR.SKU_NOT_FOUND(skus.filter((sku) => !found.has(sku))));
    }
    const bySku = new Map(variants.map((variant) => [variant.sku, variant]));
    return items.map((item) => ({
      productVariantId: bySku.get(item.sku.trim().toUpperCase())!.id,
      requestedQty: item.requestedQuantity,
    }));
  }

  private async lockTransfer(transaction: Prisma.TransactionClient, id: string): Promise<StockTransferRecord> {
    const databaseId = toDatabaseId(id);
    await transaction.$queryRaw(Prisma.sql`SELECT id FROM stock_transfers WHERE id = ${databaseId} FOR UPDATE`);
    const transfer = await transaction.stockTransfer.findUnique({
      where: { id: databaseId }, include: stockTransferInclude,
    });
    if (!transfer) throw new NotFoundException(STOCK_TRANSFER_ERROR.NOT_FOUND);
    return transfer;
  }

  private async lockBalances(transaction: Prisma.TransactionClient, warehouseId: bigint, variantIds: bigint[]) {
    await transaction.$queryRaw(Prisma.sql`
      SELECT id FROM inventory_balances
      WHERE warehouse_id = ${warehouseId}
        AND product_variant_id IN (${Prisma.join(variantIds)})
      ORDER BY product_variant_id FOR UPDATE
    `);
  }

  private async updateBalance(
    transaction: Prisma.TransactionClient,
    id: bigint,
    version: bigint,
    onHand: number,
  ): Promise<void> {
    const result = await transaction.inventoryBalance.updateMany({
      where: { id, version }, data: { onHand, version: { increment: 1 } },
    });
    if (result.count !== 1) throw new ConflictException(STOCK_TRANSFER_ERROR.CONCURRENT_UPDATE);
  }

  private assertReceiveReplay(transfer: StockTransferRecord, input: ReceiveStockTransferDto): void {
    const received = new Map(input.items.map((item) => [item.sku.trim().toUpperCase(), item]));
    const same = received.size === transfer.items.length && transfer.items.every((item) => {
      const value = received.get(item.productVariant.sku);
      return value
        && value.receivedQuantity === item.receivedQty
        && value.damagedQuantity === item.damagedQty
        && (value.damageReason?.trim() || null) === item.damageReason;
    });
    if (!same) throw new ConflictException(STOCK_TRANSFER_ERROR.ALREADY_RECEIVED_DIFFERENTLY);
  }

  private assertBranchScope(principal: AuthPrincipal, branchId: bigint, side: 'source' | 'destination'): void {
    const allowed = principal.scopes.some((scope) => scope.type === ScopeType.GLOBAL
      || (scope.type === ScopeType.BRANCH && scope.branchId === toEntityId(branchId)));
    if (!allowed) throw new ForbiddenException(STOCK_TRANSFER_ERROR.OUT_OF_SCOPE(side));
  }

  /**
   * `version` là bộ đếm optimistic lock bắt đầu từ 0, không phải entity ID: `toDatabaseId` chỉ nhận số
   * dương nên phiếu vừa tạo (version 0) từng không submit/sửa/huỷ được (400 INVALID_ENTITY_ID).
   */
  private assertVersion(actual: bigint, expected: string): void {
    if (actual.toString() !== expected.trim()) throw new ConflictException(STOCK_TRANSFER_ERROR.VERSION_STALE);
  }

  private assertUniqueSkus(skus: string[]): void {
    if (new Set(skus.map((sku) => sku.trim().toUpperCase())).size !== skus.length) {
      throw new BadRequestException(STOCK_TRANSFER_ERROR.DUPLICATE_SKU);
    }
  }

  private requireIdempotencyKey(value: string): string {
    const key = value.trim();
    if (!key) throw new BadRequestException(INVENTORY_ERROR.IDEMPOTENCY_KEY_REQUIRED);
    if (key.length > 150) throw new BadRequestException(INVENTORY_ERROR.IDEMPOTENCY_KEY_TOO_LONG(150));
    return key;
  }

  private createRequestHash(input: CreateStockTransferDto): string {
    const canonical = {
      fromWarehouseCode: input.fromWarehouseCode.trim().toUpperCase(),
      toWarehouseCode: input.toWarehouseCode.trim().toUpperCase(),
      reason: input.reason.trim(),
      items: input.items.map((item) => ({
        sku: item.sku.trim().toUpperCase(), requestedQuantity: item.requestedQuantity,
      })).sort((left, right) => left.sku.localeCompare(right.sku)),
    };
    return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  }

  private replayCreate(record: StockTransferRecord, requestHash: string): StockTransferDetailDto {
    if (record.requestHash !== requestHash) {
      throw new ConflictException(INVENTORY_ERROR.IDEMPOTENCY_CONFLICT);
    }
    return mapStockTransferDetail(record);
  }

  private transferNo(): string {
    return `TRF-${BigInt(`0x${randomUUID().replaceAll('-', '')}`).toString(36).toUpperCase().padStart(25, '0')}`;
  }

  private async writeAudit(
    transaction: Prisma.TransactionClient,
    requestId: string,
    principal: AuthPrincipal,
    action: string,
    transfer: StockTransferRecord,
    reason: string,
    before?: StockTransferRecord,
  ): Promise<void> {
    await this.audit.write({
      requestId,
      sequenceNo: 1,
      actorType: 'USER',
      actorUserId: principal.userId,
      action,
      entityType: 'STOCK_TRANSFER',
      entityId: toEntityId(transfer.id),
      ...(before ? { before: this.auditSnapshot(before) } : {}),
      after: {
        transferNo: transfer.transferNo,
        status: transfer.status,
        fromWarehouseId: toEntityId(transfer.fromWarehouseId),
        toWarehouseId: toEntityId(transfer.toWarehouseId),
        itemCount: transfer.items.length,
      },
      reason,
    }, transaction);
  }

  private auditSnapshot(transfer: StockTransferRecord) {
    return {
      status: transfer.status,
      reason: transfer.reason,
      items: transfer.items.map((item) => ({ sku: item.productVariant.sku, requestedQuantity: item.requestedQty })),
    };
  }

  private rethrowConcurrency(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      throw new ConflictException(STOCK_TRANSFER_ERROR.CONCURRENT_UPDATE);
    }
    throw error;
  }

  private ensurePersistence(): void {
    if (!this.prisma.isEnabled()) throw new ServiceUnavailableException(INVENTORY_ERROR.STORAGE_DISABLED);
  }
}
