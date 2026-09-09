import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditWriter } from '../audit/audit.writer';
import { CartService } from '../cart/cart.service';
import { ShippingQuoteService } from '../shipping/shipping-quote.service';
import { ScopeType } from '../iam/iam.types';
import { CreateCheckoutQuoteDto } from './checkout.dto';
import { CheckoutService } from './checkout.service';

describe('CheckoutService', () => {
  const resolveGuestCartId = jest.fn().mockResolvedValue(1n);
  const findCart = jest.fn();
  const findCheckout = jest.fn();
  const findOwnedCheckout = jest.fn();
  const listCheckouts = jest.fn();
  const countCheckouts = jest.fn();
  const findWarehouses = jest.fn();
  const findCustomer = jest.fn();
  const createCustomer = jest.fn();
  const shippingQuote = jest.fn();
  const transaction = {
    $queryRaw: jest.fn(),
    cart: { findFirst: jest.fn() },
    checkoutSession: { create: jest.fn() },
  };
  const prisma = {
    cart: { findFirst: findCart },
    checkoutSession: { findUnique: findCheckout, findFirst: findOwnedCheckout, findMany: listCheckouts, count: countCheckouts },
    warehouse: { findMany: findWarehouses },
    customer: { findFirst: findCustomer, create: createCustomer },
    $transaction: jest.fn((callback: (client: typeof transaction) => unknown) => callback(transaction)),
  } as unknown as PrismaService;
  const service = new CheckoutService(
    prisma,
    { resolveGuestCartId } as unknown as CartService,
    { quoteCandidate: shippingQuote } as unknown as ShippingQuoteService,
    { getOrThrow: jest.fn().mockReturnValue(30) } as unknown as ConfigService,
    { write: jest.fn() } as unknown as AuditWriter,
  );
  const input: CreateCheckoutQuoteDto = {
    recipient: {
      recipient: 'Nguyễn Văn An',
      phone: '0912345678',
      addressLine: '12 Nguyễn Trãi',
      district: 'Quận 1',
      province: 'TP. Hồ Chí Minh',
      provinceCode: '79',
    },
    paymentMethod: 'COD',
  };
  const sellableCart = {
    id: 1n,
    version: 2n,
    items: [{
      id: 4n,
      productVariantId: 7n,
      quantity: 1,
      createdAt: new Date(),
      productVariant: {
        id: 7n,
        sku: 'SKU-7',
        name: 'Tạ tay',
        status: 'ACTIVE',
        weightGrams: 1000,
        lengthMm: 200,
        widthMm: 100,
        heightMm: 100,
        product: { productType: 'STANDARD', status: 'PUBLISHED' },
        prices: [{ amount: new Prisma.Decimal(500000) }],
        bundleDefinition: null,
      },
    }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resolveGuestCartId.mockResolvedValue(1n);
    findCustomer.mockResolvedValue({ id: 20n });
    transaction.cart.findFirst.mockResolvedValue({ id: 1n });
  });

  it('returns an idempotent checkout replay without quoting shipping again', async () => {
    findCart.mockResolvedValue(sellableCart);
    const requestHash = service['hashRequest'](1n, 2n, input);
    findCheckout.mockResolvedValue({
      id: 9n,
      checkoutToken: 'checkout-token',
      status: 'QUOTED',
      branchId: 2n,
      warehouseId: 3n,
      paymentMethod: 'COD',
      shippingMethod: 'BRANCH_FREE',
      shippingProvider: 'INTERNAL',
      distanceKm: new Prisma.Decimal('4.20'),
      itemSubtotal: new Prisma.Decimal(500000),
      shippingTotal: new Prisma.Decimal(0),
      grandTotal: new Prisma.Decimal(500000),
      etaMinDays: 0,
      etaMaxDays: 1,
      expiresAt: new Date('2026-09-08T12:00:00Z'),
      requestHash,
      branch: { name: 'Chi nhánh HCM' },
      items: [{ productVariantId: 7n, skuSnapshot: 'SKU-7', nameSnapshot: 'Tạ tay', quantity: 1, unitPrice: new Prisma.Decimal(500000), lineTotal: new Prisma.Decimal(500000) }],
    });

    await expect(service.quoteGuest('cart-token', input, 'same-key', 'request-1')).resolves.toMatchObject({
      checkoutToken: 'checkout-token',
      paymentMethod: 'COD',
      shippingMethod: 'BRANCH_FREE',
      grandTotal: '500000.00',
    });
  });

  it('rejects checkout when a cart item is no longer sellable', async () => {
    findCart.mockResolvedValue({
      ...sellableCart,
      items: [{ ...sellableCart.items[0], productVariant: { ...sellableCart.items[0].productVariant, prices: [] } }],
    });

    await expect(service.quoteGuest('cart-token', input, 'new-key', 'request-2'))
      .rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(findCheckout).not.toHaveBeenCalled();
  });

  it('rejects replaying an idempotency key with a different request hash', async () => {
    findCart.mockResolvedValue(sellableCart);
    findCheckout.mockResolvedValue({ requestHash: 'different' });

    await expect(service.quoteGuest('cart-token', input, 'used-key', 'request-3'))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('creates an awaiting quote without calling a carrier when staff consultation is requested', async () => {
    findCart.mockResolvedValue(sellableCart);
    findCheckout.mockResolvedValue(null);
    findWarehouses.mockResolvedValue([{
      id: 3n,
      branchId: 2n,
      status: 'ACTIVE',
      branch: {
        id: 2n,
        name: 'Chi nhánh HCM',
        status: 'ACTIVE',
        addressJson: {
          addressLine: '123 Nguyễn Huệ',
          district: 'Quận 1',
          province: 'TP. Hồ Chí Minh',
          latitude: 10.775,
          longitude: 106.703,
        },
      },
      inventoryBalances: [{ productVariantId: 7n, onHand: 5, reserved: 0 }],
    }]);
    transaction.checkoutSession.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({
      ...data,
      id: 30n,
      checkoutToken: data.checkoutToken,
      branchId: 2n,
      warehouseId: 3n,
      branch: { name: 'Chi nhánh HCM' },
      items: [{
        productVariantId: 7n,
        skuSnapshot: 'SKU-7',
        nameSnapshot: 'Tạ tay',
        quantity: 1,
        unitPrice: new Prisma.Decimal(500000),
        lineTotal: new Prisma.Decimal(500000),
      }],
    }));

    await expect(service.quoteGuest('cart-token', {
      ...input,
      requestShippingConsultation: true,
      recipient: { ...input.recipient, latitude: 10.776, longitude: 106.7 },
    }, 'consult-key', 'request-4')).resolves.toMatchObject({
      status: 'AWAITING_SHIPPING_CONSULTATION',
      shippingMethod: 'MANUAL_EXTERNAL',
      requiresShippingConsultation: true,
      shippingTotal: null,
      grandTotal: null,
    });
    expect(shippingQuote).not.toHaveBeenCalled();
  });

  it('loads a quote only when it belongs to the caller cart', async () => {
    findOwnedCheckout.mockResolvedValue(null);

    await expect(service.getGuest('cart-token', 'another-cart-checkout'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(findOwnedCheckout).toHaveBeenCalledWith(expect.objectContaining({
      where: { checkoutToken: 'another-cart-checkout', cartId: 1n },
    }));
  });

  it('limits the admin consultation list to assigned branches', async () => {
    listCheckouts.mockResolvedValue([]);
    countCheckouts.mockResolvedValue(0);

    await expect(service.listShippingConsultations({ page: 1, limit: 20, status: 'AWAITING_SHIPPING_CONSULTATION' }, {
      userId: '2',
      sessionId: '3',
      displayName: 'Branch manager',
      permissionVersion: '1',
      permissions: ['order.manage'],
      scopes: [{ type: ScopeType.BRANCH, branchId: '12' }],
      mustChangePassword: false,
    })).resolves.toEqual({ items: [], page: 1, limit: 20, total: 0 });
    expect(listCheckouts).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: [{ branchId: { in: [12n] } }, {}, { status: 'AWAITING_SHIPPING_CONSULTATION' }] },
    }));
  });
});
