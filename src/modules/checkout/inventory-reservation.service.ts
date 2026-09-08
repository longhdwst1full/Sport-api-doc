import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { toEntityId } from '../../common/identifiers/entity-id';
import { PrismaService } from '../../database/prisma.service';
import { AuditWriter } from '../audit/audit.writer';
import { SystemSettingService } from '../system/system-setting.service';
import {
  CHECKOUT_AUDIT_ACTION,
  CHECKOUT_ITEM_TYPE,
  CHECKOUT_STATUS,
  INVENTORY_RESERVATION_STATUS,
} from './checkout.constants';

interface BundleComponentSnapshot {
  productVariantId: string;
  quantity: number;
  sku?: string;
}

interface CheckoutDemandItem {
  itemType: string;
  productVariantId: bigint;
  quantity: number;
  componentSnapshot: Prisma.JsonValue | null;
}

interface PhysicalDemand {
  productVariantId: bigint;
  quantity: number;
  sources: Array<{ type: string; productVariantId: string; quantity: number }>;
}

export interface ReservationResult {
  id: string;
  reservationToken: string;
  status: string;
  expiresAt: string;
  items: Array<{ productVariantId: string; quantity: number }>;
}

@Injectable()
export class InventoryReservationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SystemSettingService,
    private readonly audit: AuditWriter,
  ) {}

  async confirm(
    checkoutToken: string,
    idempotencyKey: string,
    requestId: string,
  ): Promise<ReservationResult> {
    this.ensurePersistence();
    const token = checkoutToken.trim();
    const key = this.requireIdempotencyKey(idempotencyKey);
    if (!token) throw new BadRequestException('Checkout token is required');
    const requestHash = createHash('sha256').update(token).digest('hex');
    const replay = await this.findReplay(key, requestHash);
    if (replay) return replay;
    const ttlMinutes = await this.settings.getCheckoutReservationTtlMinutes();

    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          await transaction.$queryRaw(Prisma.sql`
            SELECT id FROM checkout_sessions
            WHERE checkout_token = ${token}
            FOR UPDATE
          `);
          const checkout = await transaction.checkoutSession.findUnique({
            where: { checkoutToken: token },
            include: { items: true, reservation: { include: { items: true } } },
          });
          if (!checkout) throw new BadRequestException('Checkout session was not found');
          if (checkout.reservation) {
            if (
              checkout.reservation.idempotencyKey !== key ||
              checkout.reservation.requestHash !== requestHash
            ) {
              throw new ConflictException('Checkout already has another reservation');
            }
            return this.toResult(checkout.reservation);
          }
          if (checkout.status !== CHECKOUT_STATUS.QUOTED) {
            throw new ConflictException('Only a quoted checkout can be confirmed');
          }
          const now = new Date();
          if (checkout.expiresAt <= now) throw new ConflictException('Checkout quote has expired');

          const demand = this.buildPhysicalDemand(checkout.items);
          if (demand.length === 0) throw new BadRequestException('Checkout has no sellable items');
          const variantIds = demand.map(({ productVariantId }) => productVariantId);
          await transaction.inventoryBalance.createMany({
            data: variantIds.map((productVariantId) => ({
              warehouseId: checkout.warehouseId,
              productVariantId,
            })),
            skipDuplicates: true,
          });
          await transaction.$queryRaw(Prisma.sql`
            SELECT id FROM inventory_balances
            WHERE warehouse_id = ${checkout.warehouseId}
              AND product_variant_id IN (${Prisma.join(variantIds)})
            ORDER BY product_variant_id
            FOR UPDATE
          `);
          const balances = await transaction.inventoryBalance.findMany({
            where: {
              warehouseId: checkout.warehouseId,
              productVariantId: { in: variantIds },
            },
            include: { productVariant: { select: { sku: true } } },
          });
          const balanceByVariant = new Map(
            balances.map((balance) => [balance.productVariantId, balance]),
          );
          for (const item of demand) {
            const balance = balanceByVariant.get(item.productVariantId);
            if (!balance || balance.onHand - balance.reserved < item.quantity) {
              throw new ConflictException(
                `Insufficient available stock for ${balance?.productVariant.sku ?? toEntityId(item.productVariantId)}`,
              );
            }
          }
          for (const item of demand) {
            const balance = balanceByVariant.get(item.productVariantId)!;
            const updated = await transaction.inventoryBalance.updateMany({
              where: { id: balance.id, version: balance.version },
              data: { reserved: { increment: item.quantity }, version: { increment: 1 } },
            });
            if (updated.count !== 1) {
              throw new ConflictException('Inventory changed concurrently; retry with the same key');
            }
          }

          const expiresAt = new Date(now.getTime() + ttlMinutes * 60_000);
          const reservation = await transaction.inventoryReservation.create({
            data: {
              checkoutSessionId: checkout.id,
              warehouseId: checkout.warehouseId,
              reservationToken: randomUUID(),
              idempotencyKey: key,
              requestHash,
              expiresAt,
              items: {
                create: demand.map((item) => ({
                  productVariantId: item.productVariantId,
                  quantity: item.quantity,
                  sourceBreakdownJson: item.sources,
                })),
              },
            },
            include: { items: true },
          });
          await transaction.checkoutSession.update({
            where: { id: checkout.id },
            data: { status: CHECKOUT_STATUS.CONFIRMED, confirmedAt: now, version: { increment: 1 } },
          });
          await this.audit.write(
            {
              requestId,
              sequenceNo: 1,
              actorType: 'GUEST',
              action: CHECKOUT_AUDIT_ACTION.RESERVATION_CONFIRM,
              entityType: 'INVENTORY_RESERVATION',
              entityId: toEntityId(reservation.id),
              after: {
                checkoutSessionId: toEntityId(checkout.id),
                warehouseId: toEntityId(checkout.warehouseId),
                expiresAt: expiresAt.toISOString(),
                itemCount: demand.length,
              },
            },
            transaction,
          );
          return this.toResult(reservation);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictException('Inventory changed concurrently; retry with the same key');
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const racedReplay = await this.findReplay(key, requestHash);
        if (racedReplay) return racedReplay;
      }
      throw error;
    }
  }

  async release(
    reservationToken: string,
    reason: string,
    requestId: string,
    targetStatus: 'RELEASED' | 'EXPIRED' = INVENTORY_RESERVATION_STATUS.RELEASED,
  ): Promise<ReservationResult> {
    this.ensurePersistence();
    const token = reservationToken.trim();
    const normalizedReason = reason.trim();
    if (!token) throw new BadRequestException('Reservation token is required');
    if (!normalizedReason) throw new BadRequestException('Release reason is required');

    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          await transaction.$queryRaw(Prisma.sql`
            SELECT id FROM inventory_reservations
            WHERE reservation_token = ${token}
            FOR UPDATE
          `);
          const reservation = await transaction.inventoryReservation.findUnique({
            where: { reservationToken: token },
            include: { items: true },
          });
          if (!reservation) throw new BadRequestException('Inventory reservation was not found');
          if (
            reservation.status === INVENTORY_RESERVATION_STATUS.RELEASED ||
            reservation.status === INVENTORY_RESERVATION_STATUS.EXPIRED
          ) {
            if (
              reservation.status !== targetStatus ||
              reservation.releaseReason !== normalizedReason
            ) {
              throw new ConflictException('Reservation was already released by another command');
            }
            return this.toResult(reservation);
          }
          if (reservation.status !== INVENTORY_RESERVATION_STATUS.ACTIVE) {
            throw new ConflictException(
              'Committed reservation cannot be released; create a compensating stock movement',
            );
          }
          const now = new Date();
          if (
            targetStatus === INVENTORY_RESERVATION_STATUS.EXPIRED &&
            reservation.expiresAt > now
          ) {
            throw new ConflictException('Reservation has not expired yet');
          }
          const variantIds = reservation.items
            .map(({ productVariantId }) => productVariantId)
            .sort((left, right) => (left < right ? -1 : 1));
          if (variantIds.length === 0) {
            throw new ServiceUnavailableException('Inventory reservation has no items');
          }
          await transaction.$queryRaw(Prisma.sql`
            SELECT id FROM inventory_balances
            WHERE warehouse_id = ${reservation.warehouseId}
              AND product_variant_id IN (${Prisma.join(variantIds)})
            ORDER BY product_variant_id
            FOR UPDATE
          `);
          const balances = await transaction.inventoryBalance.findMany({
            where: {
              warehouseId: reservation.warehouseId,
              productVariantId: { in: variantIds },
            },
          });
          const balanceByVariant = new Map(
            balances.map((balance) => [balance.productVariantId, balance]),
          );
          for (const item of reservation.items) {
            const balance = balanceByVariant.get(item.productVariantId);
            if (!balance || balance.reserved < item.quantity) {
              throw new ServiceUnavailableException('Reserved inventory counter is inconsistent');
            }
            const updated = await transaction.inventoryBalance.updateMany({
              where: { id: balance.id, version: balance.version },
              data: { reserved: { decrement: item.quantity }, version: { increment: 1 } },
            });
            if (updated.count !== 1) {
              throw new ConflictException('Inventory changed concurrently; retry release');
            }
          }
          const updatedReservation = await transaction.inventoryReservation.update({
            where: { id: reservation.id },
            data: {
              status: targetStatus,
              releasedAt: now,
              releaseReason: normalizedReason,
              version: { increment: 1 },
            },
            include: { items: true },
          });
          await transaction.checkoutSession.update({
            where: { id: reservation.checkoutSessionId },
            data: {
              status:
                targetStatus === INVENTORY_RESERVATION_STATUS.EXPIRED
                  ? CHECKOUT_STATUS.EXPIRED
                  : CHECKOUT_STATUS.CANCELLED,
              version: { increment: 1 },
            },
          });
          await this.audit.write(
            {
              requestId,
              sequenceNo: 1,
              actorType:
                targetStatus === INVENTORY_RESERVATION_STATUS.EXPIRED ? 'SYSTEM' : 'GUEST',
              action: CHECKOUT_AUDIT_ACTION.RESERVATION_RELEASE,
              entityType: 'INVENTORY_RESERVATION',
              entityId: toEntityId(reservation.id),
              before: { status: reservation.status },
              after: { status: targetStatus, releasedAt: now.toISOString() },
              reason: normalizedReason,
            },
            transaction,
          );
          return this.toResult(updatedReservation);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictException('Inventory changed concurrently; retry release');
      }
      throw error;
    }
  }

  buildPhysicalDemand(items: CheckoutDemandItem[]): PhysicalDemand[] {
    const demand = new Map<bigint, PhysicalDemand>();
    const add = (productVariantId: bigint, quantity: number, type: string) => {
      if (!Number.isSafeInteger(quantity) || quantity < 1) {
        throw new ServiceUnavailableException('Checkout item snapshot has invalid quantity');
      }
      const current = demand.get(productVariantId) ?? {
        productVariantId,
        quantity: 0,
        sources: [],
      };
      current.quantity += quantity;
      current.sources.push({ type, productVariantId: toEntityId(productVariantId), quantity });
      demand.set(productVariantId, current);
    };

    for (const item of items) {
      if (item.itemType === CHECKOUT_ITEM_TYPE.STANDARD) {
        add(item.productVariantId, item.quantity, CHECKOUT_ITEM_TYPE.STANDARD);
        continue;
      }
      if (item.itemType !== CHECKOUT_ITEM_TYPE.BUNDLE || !Array.isArray(item.componentSnapshot)) {
        throw new ServiceUnavailableException('Checkout item has invalid bundle snapshot');
      }
      for (const rawComponent of item.componentSnapshot) {
        const component = rawComponent as unknown as BundleComponentSnapshot;
        if (
          !component ||
          typeof component.productVariantId !== 'string' ||
          !/^[1-9]\d*$/.test(component.productVariantId) ||
          !Number.isSafeInteger(component.quantity) ||
          component.quantity < 1
        ) {
          throw new ServiceUnavailableException('Checkout item has invalid bundle component');
        }
        add(
          BigInt(component.productVariantId),
          item.quantity * component.quantity,
          CHECKOUT_ITEM_TYPE.BUNDLE,
        );
      }
    }
    return [...demand.values()].sort((left, right) =>
      left.productVariantId < right.productVariantId ? -1 : 1,
    );
  }

  private async findReplay(key: string, requestHash: string): Promise<ReservationResult | undefined> {
    const reservation = await this.prisma.inventoryReservation.findUnique({
      where: { idempotencyKey: key },
      include: { items: true },
    });
    if (!reservation) return undefined;
    if (reservation.requestHash !== requestHash) {
      throw new ConflictException('Idempotency-Key was already used with another checkout');
    }
    return this.toResult(reservation);
  }

  private requireIdempotencyKey(value: string): string {
    const key = value.trim();
    if (!key) throw new BadRequestException('Idempotency-Key is required');
    if (key.length > 150) throw new BadRequestException('Idempotency-Key is too long');
    return key;
  }

  private toResult(reservation: {
    id: bigint;
    reservationToken: string;
    status: string;
    expiresAt: Date;
    items: Array<{ productVariantId: bigint; quantity: number }>;
  }): ReservationResult {
    return {
      id: toEntityId(reservation.id),
      reservationToken: reservation.reservationToken,
      status: reservation.status,
      expiresAt: reservation.expiresAt.toISOString(),
      items: reservation.items.map((item) => ({
        productVariantId: toEntityId(item.productVariantId),
        quantity: item.quantity,
      })),
    };
  }

  private ensurePersistence(): void {
    if (!this.prisma.isEnabled()) {
      throw new ServiceUnavailableException('Durable checkout storage is not enabled');
    }
  }
}
