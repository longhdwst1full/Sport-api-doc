import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { toDatabaseId, toEntityId } from '../../common/identifiers/entity-id';
import { PrismaService } from '../../database/prisma.service';
import { normalizeVietnamesePhone } from '../auth/phone-normalization';
import { AuditWriter } from '../audit/audit.writer';
import { CartService } from '../cart/cart.service';
import { PRODUCT_STATUS, PRODUCT_TYPE, PRODUCT_VARIANT_STATUS } from '../catalog/products/product.constants';
import { USER_STATUS, USER_TYPE } from '../iam/iam.constants';
import type { AuthPrincipal } from '../auth/auth.types';
import { ScopeType } from '../iam/iam.types';
import { distanceKm } from '../shipping/shipping-distance';
import { DeliveryQuoteOption, ShippingQuoteService } from '../shipping/shipping-quote.service';
import { CHECKOUT_AUDIT_ACTION, CHECKOUT_ITEM_TYPE, CHECKOUT_STATUS } from './checkout.constants';
import { CheckoutQuoteDto, CreateCheckoutQuoteDto, UpdateManualShippingQuoteDto } from './checkout.dto';

type ActorContext = { type: 'GUEST' | 'USER'; userId?: string; requestId: string };
type Demand = { productVariantId: bigint; quantity: number };

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly carts: CartService,
    private readonly shipping: ShippingQuoteService,
    private readonly config: ConfigService,
    private readonly audit: AuditWriter,
  ) {}

  async quoteGuest(rawCartToken: string, input: CreateCheckoutQuoteDto, idempotencyKey: string, requestId: string): Promise<CheckoutQuoteDto> {
    const cartId = await this.carts.resolveGuestCartId(rawCartToken);
    return this.quote(cartId, input, idempotencyKey, { type: 'GUEST', requestId });
  }

  async quoteAccount(userId: string, input: CreateCheckoutQuoteDto, idempotencyKey: string, requestId: string): Promise<CheckoutQuoteDto> {
    const cartId = await this.carts.resolveAccountCartId(userId);
    return this.quote(cartId, input, idempotencyKey, { type: 'USER', userId, requestId });
  }

  async getGuest(rawCartToken: string, checkoutToken: string): Promise<CheckoutQuoteDto> {
    return this.getOwnedCheckout(await this.carts.resolveGuestCartId(rawCartToken), checkoutToken);
  }

  async getAccount(userId: string, checkoutToken: string): Promise<CheckoutQuoteDto> {
    return this.getOwnedCheckout(await this.carts.resolveAccountCartId(userId), checkoutToken);
  }

  async updateManualShipping(checkoutToken: string, input: UpdateManualShippingQuoteDto, principal: AuthPrincipal, requestId: string): Promise<CheckoutQuoteDto> {
    const token = checkoutToken.trim();
    const fee = new Prisma.Decimal(input.shippingFee);
    if (fee.isNegative()) throw new UnprocessableEntityException('Shipping fee cannot be negative');
    if (input.etaMaxDays < input.etaMinDays) throw new UnprocessableEntityException('ETA maximum must not be less than ETA minimum');
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`SELECT id FROM checkout_sessions WHERE checkout_token = ${token} FOR UPDATE`);
      const current = await transaction.checkoutSession.findUnique({ where: { checkoutToken: token }, include: { branch: true, items: true } });
      if (!current) throw new BadRequestException('Checkout session was not found');
      const scoped = principal.scopes.some((scope) => scope.type === ScopeType.GLOBAL || (scope.type === ScopeType.BRANCH && scope.branchId === toEntityId(current.branchId)));
      if (!scoped) throw new ForbiddenException('Checkout is outside the assigned branch scope');
      if (current.status !== CHECKOUT_STATUS.AWAITING_SHIPPING_CONSULTATION) throw new ConflictException('Checkout is not awaiting shipping consultation');
      if (Number(current.version) !== input.expectedVersion) throw new ConflictException('Checkout changed; reload and retry');
      const updated = await transaction.checkoutSession.update({
        where: { id: current.id },
        data: {
          status: CHECKOUT_STATUS.QUOTED,
          shippingMethod: 'MANUAL_EXTERNAL',
          shippingProvider: input.provider?.trim() || 'MANUAL',
          shippingTotal: fee,
          grandTotal: current.itemSubtotal.add(fee),
          etaMinDays: input.etaMinDays,
          etaMaxDays: input.etaMaxDays,
          shippingRuleSnapshot: {
            method: 'MANUAL_EXTERNAL',
            provider: input.provider?.trim() || 'MANUAL',
            agreementNote: input.agreementNote.trim(),
            agreedByUserId: principal.userId,
            agreedAt: new Date().toISOString(),
          },
          expiresAt: new Date(Date.now() + this.config.getOrThrow<number>('app.checkout.reservationTtlMinutes') * 60_000),
          version: { increment: 1 },
        },
        include: { branch: true, items: true },
      });
      await this.audit.write({
        requestId,
        sequenceNo: 1,
        actorType: 'USER',
        actorUserId: principal.userId,
        action: CHECKOUT_AUDIT_ACTION.QUOTE_MANUAL_UPDATE,
        entityType: 'CHECKOUT_SESSION',
        entityId: toEntityId(current.id),
        before: { status: current.status, shippingTotal: current.shippingTotal.toFixed(2) },
        after: { status: updated.status, shippingTotal: updated.shippingTotal.toFixed(2), provider: updated.shippingProvider },
        reason: input.agreementNote.trim(),
      }, transaction);
      return this.toDto(updated);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async quote(cartId: bigint, input: CreateCheckoutQuoteDto, rawKey: string, actor: ActorContext): Promise<CheckoutQuoteDto> {
    const idempotencyKey = rawKey.trim();
    if (!idempotencyKey || idempotencyKey.length > 150) {
      throw new BadRequestException('A valid Idempotency-Key header is required');
    }
    const cart = await this.loadSellableCart(cartId);
    const requestHash = this.hashRequest(cart.id, cart.version, input);
    const replay = await this.prisma.checkoutSession.findUnique({
      where: { idempotencyKey },
      include: { branch: true, items: true },
    });
    if (replay) {
      if (replay.requestHash !== requestHash) throw new ConflictException('Idempotency key was used with another checkout request');
      return this.toDto(replay);
    }

    const customerId = await this.resolveCustomer(actor.userId, input);
    const items = this.snapshotItems(cart.items);
    const demand = this.physicalDemand(cart.items);
    const itemSubtotal = items.reduce((total, item) => total.add(item.lineTotal), new Prisma.Decimal(0));
    const packageInput = this.packageInput(cart.items, itemSubtotal, input.paymentMethod === 'COD');
    const warehouses = await this.findEligibleWarehouses(demand);
    if (warehouses.length === 0) throw new ConflictException('No branch currently has enough stock for the entire cart');

    const recipientPoint = input.recipient.latitude !== undefined && input.recipient.longitude !== undefined
      ? { latitude: input.recipient.latitude, longitude: input.recipient.longitude }
      : null;
    const candidates = warehouses.map((warehouse) => {
      const pickup = this.asAddress(warehouse.branch.addressJson);
      const pickupPoint = pickup.latitude !== undefined && pickup.longitude !== undefined
        ? { latitude: pickup.latitude, longitude: pickup.longitude }
        : null;
      return {
        warehouse,
        pickup,
        distance: recipientPoint && pickupPoint ? distanceKm(pickupPoint, recipientPoint) : null,
      };
    });

    let selected: typeof candidates[number];
    let delivery: DeliveryQuoteOption;
    const distanceCandidates = candidates.filter((candidate) => candidate.distance !== null)
      .sort((left, right) => left.distance! - right.distance!);
    if (input.requestShippingConsultation) {
      selected = distanceCandidates[0] ?? [...candidates].sort((left, right) => left.warehouse.id < right.warehouse.id ? -1 : 1)[0];
      delivery = {
        method: 'MANUAL_EXTERNAL',
        provider: null,
        fee: null,
        etaMinDays: null,
        etaMaxDays: null,
        distanceKm: selected.distance,
        requiresConsultation: true,
      };
    } else if (recipientPoint && distanceCandidates.length > 0) {
      selected = distanceCandidates[0];
      delivery = await this.shipping.quoteCandidate(this.shippingInput(selected, input, itemSubtotal, packageInput));
    } else {
      const quoted = await Promise.all(candidates.map(async (candidate) => ({
        candidate,
        delivery: await this.shipping.quoteCandidate(this.shippingInput(candidate, input, itemSubtotal, packageInput)),
      })));
      quoted.sort((left, right) =>
        Number(left.delivery.requiresConsultation) - Number(right.delivery.requiresConsultation) ||
        this.moneyRank(left.delivery.fee) - this.moneyRank(right.delivery.fee) ||
        (left.delivery.etaMaxDays ?? Number.MAX_SAFE_INTEGER) - (right.delivery.etaMaxDays ?? Number.MAX_SAFE_INTEGER),
      );
      selected = quoted[0].candidate;
      delivery = quoted[0].delivery;
    }

    const status = delivery.requiresConsultation
      ? CHECKOUT_STATUS.AWAITING_SHIPPING_CONSULTATION
      : CHECKOUT_STATUS.QUOTED;
    const shippingTotal = new Prisma.Decimal(delivery.fee ?? 0);
    const expiresAt = new Date(Date.now() + this.config.getOrThrow<number>('app.checkout.reservationTtlMinutes') * 60_000);
    const checkoutToken = randomUUID();

    try {
      const created = await this.prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw(Prisma.sql`SELECT id FROM carts WHERE id = ${cart.id} FOR UPDATE`);
        const unchanged = await transaction.cart.findFirst({ where: { id: cart.id, status: 'ACTIVE', version: cart.version }, select: { id: true } });
        if (!unchanged) throw new ConflictException('Cart changed while checkout was quoted; retry');
        const checkout = await transaction.checkoutSession.create({
          data: {
            checkoutToken,
            cartId: cart.id,
            customerId,
            branchId: selected.warehouse.branchId,
            warehouseId: selected.warehouse.id,
            status,
            paymentMethod: input.paymentMethod,
            shippingMethod: delivery.method,
            shippingProvider: delivery.provider,
            providerQuoteRef: delivery.providerQuoteRef,
            distanceKm: delivery.distanceKm === null ? null : new Prisma.Decimal(delivery.distanceKm.toFixed(2)),
            customerNote: input.note?.trim() || null,
            itemSubtotal,
            shippingTotal,
            grandTotal: itemSubtotal.add(shippingTotal),
            etaMinDays: delivery.etaMinDays ?? 0,
            etaMaxDays: delivery.etaMaxDays ?? 0,
            recipientSnapshot: input.recipient as unknown as Prisma.InputJsonValue,
            shippingRuleSnapshot: {
              method: delivery.method,
              provider: delivery.provider,
              requiresConsultation: delivery.requiresConsultation,
              distanceKm: delivery.distanceKm,
              quotedAt: new Date().toISOString(),
            },
            idempotencyKey,
            requestHash,
            expiresAt,
            items: { create: items },
          },
          include: { branch: true, items: true },
        });
        await this.audit.write({
          requestId: actor.requestId,
          sequenceNo: 1,
          actorType: actor.type,
          actorUserId: actor.userId,
          action: CHECKOUT_AUDIT_ACTION.QUOTE_CREATE,
          entityType: 'CHECKOUT_SESSION',
          entityId: toEntityId(checkout.id),
          after: {
            branchId: toEntityId(checkout.branchId),
            warehouseId: toEntityId(checkout.warehouseId),
            paymentMethod: checkout.paymentMethod,
            shippingMethod: checkout.shippingMethod,
            status: checkout.status,
          },
        }, transaction);
        return checkout;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return this.toDto(created);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await this.prisma.checkoutSession.findUnique({ where: { idempotencyKey }, include: { branch: true, items: true } });
        if (raced?.requestHash === requestHash) return this.toDto(raced);
      }
      throw error;
    }
  }

  private async loadSellableCart(cartId: bigint) {
    const now = new Date();
    const cart = await this.prisma.cart.findFirst({
      where: { id: cartId, status: 'ACTIVE' },
      include: {
        items: {
          include: {
            productVariant: {
              include: {
                product: true,
                prices: {
                  where: { status: 'ACTIVE', priceType: 'REGULAR', channel: 'ONLINE', startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
                  orderBy: { startsAt: 'desc' },
                  take: 1,
                },
                bundleDefinition: { include: { items: { include: { componentVariant: true } } } },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!cart || cart.items.length === 0) throw new UnprocessableEntityException('Cart has no sellable items');
    for (const item of cart.items) {
      const variant = item.productVariant;
      const bundleValid = variant.product.productType === PRODUCT_TYPE.BUNDLE && variant.bundleDefinition?.status === 'ACTIVE' && variant.bundleDefinition.items.length > 0;
      const standardValid = variant.product.productType === PRODUCT_TYPE.STANDARD && !variant.bundleDefinition;
      if (variant.status !== PRODUCT_VARIANT_STATUS.ACTIVE || variant.product.status !== PRODUCT_STATUS.PUBLISHED || variant.prices.length !== 1 || (!bundleValid && !standardValid)) {
        throw new UnprocessableEntityException(`Variant ${variant.sku} is no longer sellable`);
      }
    }
    return cart;
  }

  private async getOwnedCheckout(cartId: bigint, rawCheckoutToken: string): Promise<CheckoutQuoteDto> {
    const checkout = await this.prisma.checkoutSession.findFirst({
      where: { checkoutToken: rawCheckoutToken.trim(), cartId },
      include: { branch: true, items: true },
    });
    if (!checkout) throw new NotFoundException('Checkout was not found for this cart');
    return this.toDto(checkout);
  }

  private snapshotItems(items: Awaited<ReturnType<CheckoutService['loadSellableCart']>>['items']) {
    return items.map((item) => {
      const variant = item.productVariant;
      const unitPrice = variant.prices[0].amount;
      const componentSnapshot = variant.bundleDefinition
        ? variant.bundleDefinition.items.map((component) => ({
            productVariantId: toEntityId(component.componentVariantId),
            sku: component.componentVariant.sku,
            quantity: component.quantity,
          }))
        : undefined;
      return {
        cartItemId: item.id,
        productVariantId: variant.id,
        itemType: componentSnapshot ? CHECKOUT_ITEM_TYPE.BUNDLE : CHECKOUT_ITEM_TYPE.STANDARD,
        skuSnapshot: variant.sku,
        nameSnapshot: variant.name,
        quantity: item.quantity,
        unitPrice,
        lineTotal: unitPrice.mul(item.quantity),
        componentSnapshot,
      };
    });
  }

  private physicalDemand(items: Awaited<ReturnType<CheckoutService['loadSellableCart']>>['items']): Demand[] {
    const demand = new Map<bigint, number>();
    const add = (id: bigint, quantity: number) => demand.set(id, (demand.get(id) ?? 0) + quantity);
    for (const item of items) {
      if (!item.productVariant.bundleDefinition) add(item.productVariantId, item.quantity);
      else for (const component of item.productVariant.bundleDefinition.items) add(component.componentVariantId, component.quantity * item.quantity);
    }
    return Array.from(demand, ([productVariantId, quantity]) => ({ productVariantId, quantity }));
  }

  private packageInput(items: Awaited<ReturnType<CheckoutService['loadSellableCart']>>['items'], subtotal: Prisma.Decimal, cod: boolean) {
    let weightGrams = 0;
    let lengthMm = 0;
    let widthMm = 0;
    let heightMm = 0;
    const add = (variant: { weightGrams: number; lengthMm: number | null; widthMm: number | null; heightMm: number | null }, quantity: number) => {
      weightGrams += variant.weightGrams * quantity;
      lengthMm = Math.max(lengthMm, variant.lengthMm ?? 0);
      widthMm = Math.max(widthMm, variant.widthMm ?? 0);
      heightMm += (variant.heightMm ?? 0) * quantity;
    };
    for (const item of items) {
      const bundle = item.productVariant.bundleDefinition;
      if (!bundle) add(item.productVariant, item.quantity);
      else for (const component of bundle.items) add(component.componentVariant, component.quantity * item.quantity);
    }
    const declaredValue = Math.min(Number(subtotal.toFixed(0)), 5_000_000);
    return {
      weightGrams: Math.max(1, weightGrams),
      lengthCm: lengthMm ? Math.ceil(lengthMm / 10) : undefined,
      widthCm: widthMm ? Math.ceil(widthMm / 10) : undefined,
      heightCm: heightMm ? Math.ceil(heightMm / 10) : undefined,
      declaredValue,
      codAmount: cod ? Number(subtotal.toFixed(0)) : 0,
    };
  }

  private async findEligibleWarehouses(demand: Demand[]) {
    const ids = demand.map(({ productVariantId }) => productVariantId);
    const warehouses = await this.prisma.warehouse.findMany({
      where: { status: 'ACTIVE', branch: { status: 'ACTIVE' } },
      include: { branch: true, inventoryBalances: { where: { productVariantId: { in: ids } } } },
    });
    return warehouses.filter((warehouse) => demand.every((item) => {
      const balance = warehouse.inventoryBalances.find((candidate) => candidate.productVariantId === item.productVariantId);
      return balance !== undefined && balance.onHand - balance.reserved >= item.quantity;
    }));
  }

  private asAddress(value: Prisma.JsonValue) {
    const address = value as Record<string, unknown>;
    const text = (field: unknown) => typeof field === 'string' ? field : '';
    return {
      addressLine: text(address.addressLine),
      ward: typeof address.ward === 'string' ? address.ward : undefined,
      district: text(address.district),
      province: text(address.province),
      provinceCode: typeof address.provinceCode === 'string' ? address.provinceCode : undefined,
      districtCode: typeof address.districtCode === 'string' ? address.districtCode : undefined,
      wardCode: typeof address.wardCode === 'string' ? address.wardCode : undefined,
      latitude: typeof address.latitude === 'number' ? address.latitude : undefined,
      longitude: typeof address.longitude === 'number' ? address.longitude : undefined,
    };
  }

  private shippingInput(candidate: { warehouse: { id: bigint; branchId: bigint }; pickup: ReturnType<CheckoutService['asAddress']>; distance: number | null }, input: CreateCheckoutQuoteDto, subtotal: Prisma.Decimal, packageInput: ReturnType<CheckoutService['packageInput']>) {
    return {
      branchId: toEntityId(candidate.warehouse.branchId),
      provinceCode: input.recipient.provinceCode,
      subtotal: subtotal.toFixed(2),
      distanceKm: candidate.distance,
      pickup: candidate.pickup,
      recipient: input.recipient,
      package: packageInput,
    };
  }

  private async resolveCustomer(userId: string | undefined, input: CreateCheckoutQuoteDto): Promise<bigint> {
    const normalizedPhone = normalizeVietnamesePhone(input.recipient.phone);
    const normalizedEmail = input.recipient.email?.trim().toLowerCase() || null;
    if (userId) {
      const databaseUserId = toDatabaseId(userId);
      const existing = await this.prisma.customer.findUnique({ where: { userId: databaseUserId } });
      if (existing) return existing.id;
      const user = await this.prisma.user.findFirst({ where: { id: databaseUserId, userType: USER_TYPE.CUSTOMER, status: USER_STATUS.ACTIVE } });
      if (!user) throw new UnprocessableEntityException('Active customer account was not found');
      return (await this.prisma.customer.create({ data: {
        userId: user.id,
        customerNo: `CUS-${user.id.toString().padStart(8, '0')}`,
        name: user.displayName,
        email: user.email ?? normalizedEmail,
        normalizedEmail: user.normalizedEmail ?? normalizedEmail,
        phone: user.phone ?? normalizedPhone,
        normalizedPhone: user.normalizedPhone ?? normalizedPhone,
      } })).id;
    }
    const existing = await this.prisma.customer.findFirst({ where: { OR: [
      { normalizedPhone },
      ...(normalizedEmail ? [{ normalizedEmail }] : []),
    ] } });
    if (existing) return existing.id;
    return (await this.prisma.customer.create({ data: {
      customerNo: `CUS-G-${randomUUID().replaceAll('-', '').slice(0, 20).toUpperCase()}`,
      name: input.recipient.recipient.trim(),
      email: normalizedEmail,
      normalizedEmail,
      phone: normalizedPhone,
      normalizedPhone,
    } })).id;
  }

  private hashRequest(cartId: bigint, version: bigint, input: CreateCheckoutQuoteDto): string {
    return createHash('sha256').update(JSON.stringify({ cartId: toEntityId(cartId), version: toEntityId(version), input })).digest('hex');
  }

  private moneyRank(value: string | null): number {
    return value === null ? Number.MAX_SAFE_INTEGER : Number(value);
  }

  private toDto(checkout: { checkoutToken: string; status: string; branchId: bigint; warehouseId: bigint; branch: { name: string }; paymentMethod: string; shippingMethod: string; shippingProvider: string | null; distanceKm: Prisma.Decimal | null; itemSubtotal: Prisma.Decimal; shippingTotal: Prisma.Decimal; grandTotal: Prisma.Decimal; etaMinDays: number; etaMaxDays: number; expiresAt: Date; items: Array<{ productVariantId: bigint; skuSnapshot: string; nameSnapshot: string; quantity: number; unitPrice: Prisma.Decimal; lineTotal: Prisma.Decimal }> }): CheckoutQuoteDto {
    const consultation = checkout.status === CHECKOUT_STATUS.AWAITING_SHIPPING_CONSULTATION;
    return {
      checkoutToken: checkout.checkoutToken,
      status: checkout.status,
      branchId: toEntityId(checkout.branchId),
      warehouseId: toEntityId(checkout.warehouseId),
      branchName: checkout.branch.name,
      paymentMethod: checkout.paymentMethod,
      shippingMethod: checkout.shippingMethod,
      shippingProvider: checkout.shippingProvider,
      distanceKm: checkout.distanceKm?.toFixed(2) ?? null,
      itemSubtotal: checkout.itemSubtotal.toFixed(2),
      shippingTotal: consultation ? null : checkout.shippingTotal.toFixed(2),
      grandTotal: consultation ? null : checkout.grandTotal.toFixed(2),
      etaMinDays: consultation ? null : checkout.etaMinDays,
      etaMaxDays: consultation ? null : checkout.etaMaxDays,
      requiresShippingConsultation: consultation,
      items: checkout.items.map((item) => ({
        productVariantId: toEntityId(item.productVariantId),
        sku: item.skuSnapshot,
        name: item.nameSnapshot,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toFixed(2),
        lineTotal: item.lineTotal.toFixed(2),
      })),
      expiresAt: checkout.expiresAt.toISOString(),
    };
  }
}
