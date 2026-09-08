import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditWriter } from '../audit/audit.writer';
import { CartService } from '../cart/cart.service';
import { ShippingQuoteService } from '../shipping/shipping-quote.service';
import { CreateCheckoutQuoteDto } from './checkout.dto';
import { CheckoutService } from './checkout.service';

describe('CheckoutService', () => {
  const resolveGuestCartId = jest.fn().mockResolvedValue(1n);
  const findCart = jest.fn();
  const findCheckout = jest.fn();
  const prisma = {
    cart: { findFirst: findCart },
    checkoutSession: { findUnique: findCheckout },
  } as unknown as PrismaService;
  const service = new CheckoutService(
    prisma,
    { resolveGuestCartId } as unknown as CartService,
    {} as ShippingQuoteService,
    {} as ConfigService,
    {} as AuditWriter,
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
});
