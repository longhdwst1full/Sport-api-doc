import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toDatabaseId, toEntityId } from '../../common/identifiers/entity-id';
import { PrismaService } from '../../database/prisma.service';
import { AuditWriter } from '../audit/audit.writer';
import type { AuthPrincipal } from '../auth/auth.types';
import { ScopeType } from '../iam/iam.types';
import {
  CreateStockAdjustmentDto,
  InventoryBalanceDto,
  StockAdjustmentResultDto,
} from './inventory.dto';
import {
  INVENTORY_MOVEMENT_TYPE,
  INVENTORY_REFERENCE_TYPE,
  INVENTORY_TRANSACTION,
  STOCK_ADJUSTMENT_REASON,
  STOCK_ADJUSTMENT_TYPE,
  type StockAdjustmentType,
  INVENTORY_ERROR,
} from './inventory.constants';

const INVENTORY_AUDIT_ACTION = {
  STOCK_ADJUSTMENT_POST: 'inventory.stock_adjustment.post',
} as const;

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
  ) {}

  async adjust(
    input: CreateStockAdjustmentDto,
    idempotencyKey: string,
    principal: AuthPrincipal,
    requestId: string,
  ): Promise<StockAdjustmentResultDto> {
    this.ensurePersistence();
    const key = idempotencyKey.trim();
    if (!key) throw new BadRequestException(INVENTORY_ERROR.IDEMPOTENCY_KEY_REQUIRED);
    if (key.length > 130) {
      throw new BadRequestException(INVENTORY_ERROR.IDEMPOTENCY_KEY_TOO_LONG(130));
    }
    if (input.items.length === 0) {
      throw new BadRequestException(INVENTORY_ERROR.ADJUSTMENT_EMPTY);
    }
    if (new Set(input.items.map(({ sku }) => sku.trim().toUpperCase())).size !== input.items.length) {
      throw new BadRequestException(INVENTORY_ERROR.DUPLICATE_SKU);
    }
    const adjustmentType = input.adjustmentType ?? STOCK_ADJUSTMENT_TYPE.CORRECTION;
    const reasonCode = input.reasonCode?.trim().toUpperCase() || STOCK_ADJUSTMENT_REASON.MANUAL;
    const externalReference = input.externalReference?.trim() || null;
    const sourceName = input.sourceName?.trim() || null;
    this.validateAdjustmentType(input, adjustmentType, externalReference, sourceName);
    const isGlobal = principal.scopes.some(({ type }) => type === ScopeType.GLOBAL);
    if (
      adjustmentType === STOCK_ADJUSTMENT_TYPE.CORRECTION
      && !isGlobal
      && input.items.some(({ quantityDelta }) => quantityDelta < -10)
    ) {
      throw new ForbiddenException(INVENTORY_ERROR.BRANCH_DECREASE_LIMIT);
    }
    const requestHash = this.requestHash(input);
    const replay = await this.findReplay(key, requestHash);
    if (replay) return replay;

    try {
      return await this.withSerializationRetry(() => this.prisma.$transaction(
        async (transaction) => {
          const prior = await transaction.stockAdjustment.findUnique({
            where: { idempotencyKey: key },
          });
          if (prior) return this.replay(prior.requestHash, requestHash, prior.resultJson);

          const warehouse = await transaction.warehouse.findFirst({
            where: { code: input.warehouseCode.trim().toUpperCase(), status: 'ACTIVE' },
          });
          if (!warehouse) throw new BadRequestException(INVENTORY_ERROR.WAREHOUSE_NOT_FOUND);
          this.assertWarehouseScope(principal, warehouse.branchId);

          const requestedSkus = input.items.map(({ sku }) => sku.trim().toUpperCase()).sort();
          const variants = await transaction.productVariant.findMany({
            where: { sku: { in: requestedSkus }, product: { productType: 'STANDARD' } },
            include: { product: true },
          });
          if (variants.length !== requestedSkus.length) {
            const found = new Set(variants.map(({ sku }) => sku));
            const missing = requestedSkus.filter((sku) => !found.has(sku));
            throw new BadRequestException(INVENTORY_ERROR.SKU_NOT_FOUND(missing));
          }

          if (adjustmentType === STOCK_ADJUSTMENT_TYPE.OPENING_BALANCE) {
            const existingMovement = await transaction.inventoryMovement.findFirst({
              where: {
                warehouseId: warehouse.id,
                productVariantId: { in: variants.map(({ id }) => id) },
              },
              select: { productVariant: { select: { sku: true } } },
            });
            if (existingMovement) {
              throw new ConflictException(INVENTORY_ERROR.OPENING_BALANCE_AFTER_MOVEMENT(existingMovement.productVariant.sku));
            }
          }

          await transaction.inventoryBalance.createMany({
            data: variants.map((variant) => ({
              warehouseId: warehouse.id,
              productVariantId: variant.id,
            })),
            skipDuplicates: true,
          });
          const variantIds = variants.map(({ id }) => id).sort((left, right) =>
            left < right ? -1 : left > right ? 1 : 0,
          );
          await transaction.$queryRaw(Prisma.sql`
            SELECT "id" FROM "inventory_balances"
            WHERE "warehouse_id" = ${warehouse.id}
              AND "product_variant_id" IN (${Prisma.join(variantIds)})
            ORDER BY "product_variant_id" FOR UPDATE
          `);
          const balances = await transaction.inventoryBalance.findMany({
            where: { warehouseId: warehouse.id, productVariantId: { in: variantIds } },
          });
          const byVariant = new Map(balances.map((balance) => [balance.productVariantId, balance]));
          const bySku = new Map(variants.map((variant) => [variant.sku, variant]));
          const changes = input.items.map((item) => {
            const sku = item.sku.trim().toUpperCase();
            const variant = bySku.get(sku)!;
            const balance = byVariant.get(variant.id)!;
            const nextOnHand = balance.onHand + item.quantityDelta;
            if (nextOnHand < balance.reserved) {
              throw new BadRequestException(INVENTORY_ERROR.BELOW_RESERVED(sku));
            }
            return { item, sku, variant, balance, nextOnHand };
          });

          const postedAt = new Date();
          const adjustmentToken = randomUUID();
          const adjustmentNo = `ADJ-${BigInt(`0x${adjustmentToken.replaceAll('-', '')}`)
            .toString(36)
            .toUpperCase()
            .padStart(25, '0')}`;
          const adjustment = await transaction.stockAdjustment.create({
            data: {
              adjustmentNo,
              warehouseId: warehouse.id,
              adjustmentType,
              reasonCode,
              externalReference,
              sourceName,
              reason: input.reason.trim(),
              idempotencyKey: key,
              requestHash,
              resultJson: {},
              createdBy: toDatabaseId(principal.userId),
              postedAt,
            },
          });

          const resultBalances: InventoryBalanceDto[] = [];
          for (const change of changes) {
            const updated = await transaction.inventoryBalance.updateMany({
              where: { id: change.balance.id, version: change.balance.version },
              data: { onHand: change.nextOnHand, version: { increment: 1 } },
            });
            if (updated.count !== 1) {
              throw new ConflictException(INVENTORY_ERROR.BALANCE_CHANGED);
            }
            await transaction.stockAdjustmentItem.create({
              data: {
                stockAdjustmentId: adjustment.id,
                productVariantId: change.variant.id,
                quantityDelta: change.item.quantityDelta,
                expectedOnHand: change.balance.onHand,
                actualOnHand: change.nextOnHand,
              },
            });
            await transaction.inventoryMovement.create({
              data: {
                warehouseId: warehouse.id,
                productVariantId: change.variant.id,
                movementType: adjustmentType === STOCK_ADJUSTMENT_TYPE.CORRECTION
                  ? INVENTORY_MOVEMENT_TYPE.ADJUST
                  : INVENTORY_MOVEMENT_TYPE.RECEIVE,
                quantityDelta: change.item.quantityDelta,
                balanceAfter: change.nextOnHand,
                referenceType: INVENTORY_REFERENCE_TYPE.STOCK_ADJUSTMENT,
                referenceId: toEntityId(adjustment.id),
                idempotencyKey: `${key}:${change.sku}`,
                reason: input.reason.trim(),
                occurredAt: postedAt,
                createdBy: toDatabaseId(principal.userId),
              },
            });
            const available = change.nextOnHand - change.balance.reserved;
            resultBalances.push({
              id: toEntityId(change.balance.id),
              warehouseCode: warehouse.code,
              sku: change.variant.sku,
              productName: change.variant.product.name,
              onHand: change.nextOnHand,
              reserved: change.balance.reserved,
              available,
              reorderPoint: change.balance.reorderPoint,
              status: this.stockStatus(available, change.balance.reorderPoint),
            });
          }
          const result: StockAdjustmentResultDto = {
            adjustmentNo,
            status: 'POSTED',
            adjustmentType,
            reasonCode,
            externalReference,
            sourceName,
            reason: input.reason.trim(),
            balances: resultBalances,
            postedAt: postedAt.toISOString(),
          };
          await transaction.stockAdjustment.update({
            where: { id: adjustment.id },
            data: { resultJson: result as unknown as Prisma.InputJsonValue },
          });
          await this.audit.write(
            {
              requestId,
              sequenceNo: 1,
              actorType: 'USER',
              actorUserId: principal.userId,
              action: INVENTORY_AUDIT_ACTION.STOCK_ADJUSTMENT_POST,
              entityType: 'STOCK_ADJUSTMENT',
              entityId: toEntityId(adjustment.id),
              after: {
                adjustmentNo,
                warehouseId: toEntityId(warehouse.id),
                itemCount: changes.length,
                adjustmentType,
                reasonCode,
                externalReference,
                status: 'POSTED',
              },
              reason: input.reason.trim(),
            },
            transaction,
          );
          return result;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: INVENTORY_TRANSACTION.MAX_WAIT_MS,
          timeout: INVENTORY_TRANSACTION.TIMEOUT_MS,
        },
      ));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const racedReplay = await this.findReplay(key, requestHash);
        if (racedReplay) return racedReplay;
        if (adjustmentType === STOCK_ADJUSTMENT_TYPE.MANUAL_RECEIPT) {
          throw new ConflictException(INVENTORY_ERROR.RECEIPT_REFERENCE_DUPLICATE);
        }
      }
      if (this.isSerializationConflict(error)) {
        throw new ConflictException(INVENTORY_ERROR.BALANCE_CHANGED);
      }
      if (this.isTransientDatabaseAvailabilityError(error)) {
        throw new ServiceUnavailableException(INVENTORY_ERROR.STORAGE_BUSY);
      }
      throw error;
    }
  }

  private async findReplay(
    idempotencyKey: string,
    requestHash: string,
  ): Promise<StockAdjustmentResultDto | undefined> {
    const prior = await this.prisma.stockAdjustment.findUnique({ where: { idempotencyKey } });
    return prior ? this.replay(prior.requestHash, requestHash, prior.resultJson) : undefined;
  }

  private replay(
    storedHash: string,
    requestHash: string,
    resultJson: Prisma.JsonValue,
  ): StockAdjustmentResultDto {
    if (storedHash !== requestHash) {
      throw new ConflictException(INVENTORY_ERROR.IDEMPOTENCY_CONFLICT);
    }
    return resultJson as unknown as StockAdjustmentResultDto;
  }

  private requestHash(input: CreateStockAdjustmentDto): string {
    const canonical = {
      warehouseCode: input.warehouseCode.trim().toUpperCase(),
      adjustmentType: input.adjustmentType ?? STOCK_ADJUSTMENT_TYPE.CORRECTION,
      reasonCode: input.reasonCode?.trim().toUpperCase() || STOCK_ADJUSTMENT_REASON.MANUAL,
      externalReference: input.externalReference?.trim() || null,
      sourceName: input.sourceName?.trim() || null,
      reason: input.reason.trim(),
      items: input.items
        .map(({ sku, quantityDelta }) => ({ sku: sku.trim().toUpperCase(), quantityDelta }))
        .sort((left, right) => left.sku.localeCompare(right.sku)),
    };
    return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  }

  private validateAdjustmentType(
    input: CreateStockAdjustmentDto,
    adjustmentType: StockAdjustmentType,
    externalReference: string | null,
    sourceName: string | null,
  ): void {
    if (adjustmentType !== STOCK_ADJUSTMENT_TYPE.CORRECTION
      && input.items.some(({ quantityDelta }) => quantityDelta < 1)) {
      throw new BadRequestException(INVENTORY_ERROR.POSITIVE_QUANTITY_ONLY(adjustmentType));
    }
    if (adjustmentType === STOCK_ADJUSTMENT_TYPE.MANUAL_RECEIPT && !externalReference) {
      throw new BadRequestException(INVENTORY_ERROR.RECEIPT_REFERENCE_REQUIRED);
    }
    if (adjustmentType !== STOCK_ADJUSTMENT_TYPE.MANUAL_RECEIPT
      && (externalReference || sourceName)) {
      throw new BadRequestException(INVENTORY_ERROR.RECEIPT_FIELDS_NOT_ALLOWED);
    }
  }

  private assertWarehouseScope(principal: AuthPrincipal, branchId: bigint): void {
    const publicBranchId = toEntityId(branchId);
    const allowed = principal.scopes.some(
      (scope) => scope.type === ScopeType.GLOBAL
        || (scope.type === ScopeType.BRANCH && scope.branchId === publicBranchId),
    );
    if (!allowed) throw new ForbiddenException(INVENTORY_ERROR.WAREHOUSE_OUT_OF_SCOPE);
  }

  private stockStatus(
    available: number,
    reorderPoint: number,
  ): InventoryBalanceDto['status'] {
    if (available === 0) return 'OUT_OF_STOCK';
    return available <= reorderPoint ? 'LOW_STOCK' : 'IN_STOCK';
  }

  private async withSerializationRetry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < INVENTORY_TRANSACTION.MAX_SERIALIZATION_RETRIES; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        // IDEMPOTENCY: mỗi lần retry chạy lại từ đầu và kiểm tra stock_adjustments.idempotency_key
        // trước mọi mutation, nên retry serialization không thể tạo hai phiếu hoặc hai movement.
        if (
          this.isSerializationConflict(error)
          && attempt + 1 < INVENTORY_TRANSACTION.MAX_SERIALIZATION_RETRIES
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new ServiceUnavailableException(INVENTORY_ERROR.CONCURRENT_UPDATE);
  }

  private isSerializationConflict(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
    if (error.code === 'P2034') return true;
    const postgresCode = error.meta?.code;
    return error.code === 'P2010'
      && (typeof postgresCode === 'string' || typeof postgresCode === 'number')
      && String(postgresCode).toUpperCase() === '40001';
  }

  private isTransientDatabaseAvailabilityError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError
      && (error.code === 'P2024' || error.code === 'P2028');
  }

  private ensurePersistence(): void {
    if (!this.prisma.isEnabled()) {
      throw new ServiceUnavailableException(INVENTORY_ERROR.STORAGE_DISABLED);
    }
  }
}
