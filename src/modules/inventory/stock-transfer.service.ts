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
import { INVENTORY_MOVEMENT_TYPE, INVENTORY_REFERENCE_TYPE } from './inventory.constants';
import {
  CreateStockTransferDto,
  ReceiveStockTransferDto,
  StockTransferDetailDto,
  StockTransferTransitionDto,
} from './stock-transfer.dto';
import { mapStockTransferDetail, stockTransferInclude, type StockTransferRecord } from './stock-transfer.mapper';
import { STOCK_TRANSFER_STATUS } from './stock-transfer.constants';

const TRANSFER_AUDIT_ACTION = {
  CREATE: 'inventory.stock_transfer.create',
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
        if (codes[0] === codes[1]) throw new BadRequestException('Source and destination warehouses must differ');
        const warehouses = await transaction.warehouse.findMany({
          where: { code: { in: codes }, status: 'ACTIVE' },
        });
        const source = warehouses.find(({ code }) => code === codes[0]);
        const destination = warehouses.find(({ code }) => code === codes[1]);
        if (!source || !destination) throw new BadRequestException('Both warehouses must be active');
        this.assertBranchScope(principal, source.branchId, 'source');

        const skus = input.items.map(({ sku }) => sku.trim().toUpperCase()).sort();
        const variants = await transaction.productVariant.findMany({
          where: { sku: { in: skus }, status: 'ACTIVE', product: { productType: 'STANDARD' } },
          include: { product: true },
        });
        if (variants.length !== skus.length) {
          const found = new Set(variants.map(({ sku }) => sku));
          throw new BadRequestException(`Active standard SKU not found: ${skus.filter((sku) => !found.has(sku)).join(', ')}`);
        }
        const bySku = new Map(variants.map((variant) => [variant.sku, variant]));
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
            items: {
              create: input.items.map((item) => ({
                productVariantId: bySku.get(item.sku.trim().toUpperCase())!.id,
                requestedQty: item.requestedQuantity,
              })),
            },
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
          throw new ConflictException('Only a SHIPPED transfer can be received');
        }
        this.assertVersion(transfer.version, input.version);
        const receivedBySku = new Map(input.items.map((item) => [item.sku.trim().toUpperCase(), item]));
        if (receivedBySku.size !== transfer.items.length) {
          throw new BadRequestException('Receive payload must contain every transfer SKU exactly once');
        }
        for (const item of transfer.items) {
          const received = receivedBySku.get(item.productVariant.sku);
          if (!received) throw new BadRequestException(`Missing receive result for ${item.productVariant.sku}`);
          if (received.receivedQuantity + received.damagedQuantity !== item.shippedQty) {
            throw new BadRequestException(`receivedQuantity + damagedQuantity must equal shippedQuantity for ${item.productVariant.sku}`);
          }
          if (received.damagedQuantity > 0 && !received.damageReason?.trim()) {
            throw new BadRequestException(`damageReason is required for damaged SKU ${item.productVariant.sku}`);
          }
          if (received.damagedQuantity === 0 && received.damageReason?.trim()) {
            throw new BadRequestException(`damageReason is only allowed when damagedQuantity is positive for ${item.productVariant.sku}`);
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
        if (transfer.status !== expected) throw new ConflictException(`Only a ${expected} transfer can move to ${target}`);
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
        throw new ConflictException(`Insufficient available stock for ${item.productVariant.sku}`);
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

  private async lockTransfer(transaction: Prisma.TransactionClient, id: string): Promise<StockTransferRecord> {
    const databaseId = toDatabaseId(id);
    await transaction.$queryRaw(Prisma.sql`SELECT id FROM stock_transfers WHERE id = ${databaseId} FOR UPDATE`);
    const transfer = await transaction.stockTransfer.findUnique({
      where: { id: databaseId }, include: stockTransferInclude,
    });
    if (!transfer) throw new NotFoundException('Stock transfer was not found');
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
    if (result.count !== 1) throw new ConflictException('Inventory changed concurrently; retry');
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
    if (!same) throw new ConflictException('Transfer was already received with another result');
  }

  private assertBranchScope(principal: AuthPrincipal, branchId: bigint, side: 'source' | 'destination'): void {
    const allowed = principal.scopes.some((scope) => scope.type === ScopeType.GLOBAL
      || (scope.type === ScopeType.BRANCH && scope.branchId === toEntityId(branchId)));
    if (!allowed) throw new ForbiddenException(`Transfer ${side} is outside the assigned branch scope`);
  }

  private assertVersion(actual: bigint, expected: string): void {
    if (actual !== toDatabaseId(expected)) throw new ConflictException('Stock transfer version is stale');
  }

  private assertUniqueSkus(skus: string[]): void {
    if (new Set(skus.map((sku) => sku.trim().toUpperCase())).size !== skus.length) {
      throw new BadRequestException('Transfer items must contain unique SKU values');
    }
  }

  private requireIdempotencyKey(value: string): string {
    const key = value.trim();
    if (!key) throw new BadRequestException('Idempotency-Key is required');
    if (key.length > 150) throw new BadRequestException('Idempotency-Key must not exceed 150 characters');
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
      throw new ConflictException('Idempotency-Key was already used with another payload');
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
  ): Promise<void> {
    await this.audit.write({
      requestId,
      sequenceNo: 1,
      actorType: 'USER',
      actorUserId: principal.userId,
      action,
      entityType: 'STOCK_TRANSFER',
      entityId: toEntityId(transfer.id),
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

  private rethrowConcurrency(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      throw new ConflictException('Inventory changed concurrently; retry the transfer command');
    }
    throw error;
  }

  private ensurePersistence(): void {
    if (!this.prisma.isEnabled()) throw new ServiceUnavailableException('Durable inventory storage is not enabled');
  }
}
