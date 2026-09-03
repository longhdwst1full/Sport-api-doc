import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { PrismaService } from '../../database/prisma.service';
import { AuditWriter } from '../audit/audit.writer';
import type { AuthPrincipal } from '../auth/auth.types';
import { ScopeType } from '../iam/iam.types';
import {
  CreateStockAdjustmentDto,
  InventoryBalanceDto,
  InventoryBalanceListDto,
  StockAdjustmentResultDto,
} from './inventory.dto';

const INVENTORY_AUDIT_ACTION = {
  STOCK_ADJUSTMENT_POST: 'inventory.stock_adjustment.post',
} as const;

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
  ) {}

  async list(principal: AuthPrincipal): Promise<InventoryBalanceListDto> {
    this.ensurePersistence();
    const branchIds = principal.scopes
      .filter((scope) => scope.type === ScopeType.BRANCH && scope.branchId)
      .map((scope) => scope.branchId!);
    const global = principal.scopes.some((scope) => scope.type === ScopeType.GLOBAL);
    if (!global && branchIds.length === 0) return { items: [], total: 0 };
    const where: Prisma.InventoryBalanceWhereInput = global
      ? {}
      : { warehouse: { branchId: { in: branchIds } } };
    const rows = await this.prisma.inventoryBalance.findMany({
      where,
      include: { warehouse: true, productVariant: { include: { product: true } } },
      orderBy: [{ warehouse: { code: 'asc' } }, { productVariant: { sku: 'asc' } }],
    });
    return { items: rows.map((row) => this.toDto(row)), total: rows.length };
  }

  async adjust(
    input: CreateStockAdjustmentDto,
    idempotencyKey: string,
    principal: AuthPrincipal,
    requestId: string,
  ): Promise<StockAdjustmentResultDto> {
    this.ensurePersistence();
    const key = idempotencyKey.trim();
    if (!key) throw new BadRequestException('Idempotency-Key is required');
    if (key.length > 130) {
      throw new BadRequestException('Idempotency-Key must not exceed 130 characters');
    }
    if (input.items.length === 0) {
      throw new BadRequestException('Adjustment must contain at least one item');
    }
    if (new Set(input.items.map(({ sku }) => sku.trim().toUpperCase())).size !== input.items.length) {
      throw new BadRequestException('Adjustment items must contain unique SKU values');
    }
    const requestHash = this.requestHash(input);
    const replay = await this.findReplay(key, requestHash);
    if (replay) return replay;

    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const prior = await transaction.stockAdjustment.findUnique({
            where: { idempotencyKey: key },
          });
          if (prior) return this.replay(prior.requestHash, requestHash, prior.resultJson);

          const warehouse = await transaction.warehouse.findFirst({
            where: { code: input.warehouseCode.trim().toUpperCase(), status: 'ACTIVE' },
          });
          if (!warehouse) throw new BadRequestException('Active warehouse was not found');
          this.assertWarehouseScope(principal, warehouse.branchId);

          const requestedSkus = input.items.map(({ sku }) => sku.trim().toUpperCase()).sort();
          const variants = await transaction.productVariant.findMany({
            where: { sku: { in: requestedSkus }, product: { productType: 'STANDARD' } },
            include: { product: true },
          });
          if (variants.length !== requestedSkus.length) {
            const found = new Set(variants.map(({ sku }) => sku));
            const missing = requestedSkus.filter((sku) => !found.has(sku));
            throw new BadRequestException(`SKU not found: ${missing.join(', ')}`);
          }

          await transaction.inventoryBalance.createMany({
            data: variants.map((variant) => ({
              id: uuidv7(),
              warehouseId: warehouse.id,
              productVariantId: variant.id,
            })),
            skipDuplicates: true,
          });
          const variantIds = variants.map(({ id }) => id).sort();
          const variantUuidParameters = variantIds.map((id) => Prisma.sql`${id}::uuid`);
          await transaction.$queryRaw(Prisma.sql`
            SELECT "id" FROM "inventory_balances"
            WHERE "warehouse_id" = ${warehouse.id}::uuid
              AND "product_variant_id" IN (${Prisma.join(variantUuidParameters)})
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
              throw new BadRequestException(
                `Adjustment would make ${sku} lower than reserved stock`,
              );
            }
            return { item, sku, variant, balance, nextOnHand };
          });

          const adjustmentId = uuidv7();
          const postedAt = new Date();
          const adjustmentNo = `ADJ-${postedAt.toISOString().slice(0, 10).replaceAll('-', '')}-${adjustmentId.slice(0, 8).toUpperCase()}`;
          await transaction.stockAdjustment.create({
            data: {
              id: adjustmentId,
              adjustmentNo,
              warehouseId: warehouse.id,
              reason: input.reason.trim(),
              idempotencyKey: key,
              requestHash,
              resultJson: {},
              createdBy: principal.userId,
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
              throw new ConflictException('Inventory balance changed; retry with the same key');
            }
            await transaction.stockAdjustmentItem.create({
              data: {
                id: uuidv7(),
                stockAdjustmentId: adjustmentId,
                productVariantId: change.variant.id,
                quantityDelta: change.item.quantityDelta,
                expectedOnHand: change.balance.onHand,
                actualOnHand: change.nextOnHand,
              },
            });
            await transaction.inventoryMovement.create({
              data: {
                id: uuidv7(),
                warehouseId: warehouse.id,
                productVariantId: change.variant.id,
                movementType: 'ADJUST',
                quantityDelta: change.item.quantityDelta,
                balanceAfter: change.nextOnHand,
                referenceType: 'STOCK_ADJUSTMENT',
                referenceId: adjustmentId,
                idempotencyKey: `${key}:${change.sku}`,
                reason: input.reason.trim(),
                occurredAt: postedAt,
                createdBy: principal.userId,
              },
            });
            const available = change.nextOnHand - change.balance.reserved;
            resultBalances.push({
              id: change.balance.id,
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
            reason: input.reason.trim(),
            balances: resultBalances,
            postedAt: postedAt.toISOString(),
          };
          await transaction.stockAdjustment.update({
            where: { id: adjustmentId },
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
              entityId: adjustmentId,
              after: {
                adjustmentNo,
                warehouseId: warehouse.id,
                itemCount: changes.length,
                status: 'POSTED',
              },
              reason: input.reason.trim(),
            },
            transaction,
          );
          return result;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const racedReplay = await this.findReplay(key, requestHash);
        if (racedReplay) return racedReplay;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictException('Inventory changed concurrently; retry with the same key');
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
      throw new ConflictException('Idempotency-Key was already used with another payload');
    }
    return resultJson as unknown as StockAdjustmentResultDto;
  }

  private requestHash(input: CreateStockAdjustmentDto): string {
    const canonical = {
      warehouseCode: input.warehouseCode.trim().toUpperCase(),
      reason: input.reason.trim(),
      items: input.items
        .map(({ sku, quantityDelta }) => ({ sku: sku.trim().toUpperCase(), quantityDelta }))
        .sort((left, right) => left.sku.localeCompare(right.sku)),
    };
    return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  }

  private assertWarehouseScope(principal: AuthPrincipal, branchId: string): void {
    const allowed = principal.scopes.some(
      (scope) => scope.type === ScopeType.GLOBAL
        || (scope.type === ScopeType.BRANCH && scope.branchId === branchId),
    );
    if (!allowed) throw new ForbiddenException('Warehouse is outside the assigned branch scope');
  }

  private toDto(row: {
    id: string;
    onHand: number;
    reserved: number;
    reorderPoint: number;
    warehouse: { code: string };
    productVariant: { sku: string; product: { name: string } };
  }): InventoryBalanceDto {
    const available = row.onHand - row.reserved;
    return {
      id: row.id,
      warehouseCode: row.warehouse.code,
      sku: row.productVariant.sku,
      productName: row.productVariant.product.name,
      onHand: row.onHand,
      reserved: row.reserved,
      available,
      reorderPoint: row.reorderPoint,
      status: this.stockStatus(available, row.reorderPoint),
    };
  }

  private stockStatus(
    available: number,
    reorderPoint: number,
  ): InventoryBalanceDto['status'] {
    if (available === 0) return 'OUT_OF_STOCK';
    return available <= reorderPoint ? 'LOW_STOCK' : 'IN_STOCK';
  }

  private ensurePersistence(): void {
    if (!this.prisma.isEnabled()) {
      throw new ServiceUnavailableException('Durable inventory storage is not enabled');
    }
  }
}
