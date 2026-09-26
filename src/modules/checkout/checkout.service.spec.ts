import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditWriter } from '../audit/audit.writer';
import { CartService } from '../cart/cart.service';
import { ShippingQuoteService } from '../shipping/shipping-quote.service';
import { FlashSaleService } from '../promotion/services/flash-sale.service';
import { ScopeType } from '../iam/iam.types';
import { CreateCheckoutQuoteDto } from './checkout.dto';
import { CheckoutService } from './checkout.service';
import { InventoryReservationService } from './inventory-reservation.service';

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
  const findVariants = jest.fn();
  const resolveActiveDeals = jest.fn().mockResolvedValue(new Map());
  const transaction = {
    $queryRaw: jest.fn(),
    cart: { findFirst: jest.fn() },
    checkoutSession: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    inventoryBalance: { findMany: jest.fn() },
    productVariant: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const prisma = {
    cart: { findFirst: findCart },
    checkoutSession: { findUnique: findCheckout, findFirst: findOwnedCheckout, findMany: listCheckouts, count: countCheckouts },
    warehouse: { findMany: findWarehouses },
    productVariant: { findMany: findVariants },
    customer: { findFirst: findCustomer, create: createCustomer },
    $transaction: jest.fn((callback: (client: typeof transaction) => unknown) => callback(transaction)),
  } as unknown as PrismaService;
  const service = new CheckoutService(
    prisma,
    { resolveGuestCartId } as unknown as CartService,
    { quoteCandidate: shippingQuote } as unknown as ShippingQuoteService,
    { getOrThrow: jest.fn().mockReturnValue(30) } as unknown as ConfigService,
    { write: jest.fn() } as unknown as AuditWriter,
    // Không có campaign flash nào đang chạy trong các case này.
    { resolveActiveDeals } as unknown as FlashSaleService,
    // buildPhysicalDemand là hàm thuần; dùng bản thật để combo được tách linh kiện đúng như bước giữ hàng.
    new InventoryReservationService({} as PrismaService, {} as ConfigService, {} as AuditWriter, {} as FlashSaleService),
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
    resolveActiveDeals.mockResolvedValue(new Map());
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

  describe('multi-branch stock split', () => {
    const warehouse = (id: bigint, name: string, available: number) => ({
      id,
      branchId: id,
      status: 'ACTIVE',
      branch: { id, name, status: 'ACTIVE', addressJson: { addressLine: '1', district: 'Q1', province: 'HCM' } },
      inventoryBalances: [{ productVariantId: 7n, onHand: available, reserved: 0 }],
    });
    const cartOfThree = {
      ...sellableCart,
      items: [{ ...sellableCart.items[0], quantity: 3 }],
    };
    const echoCreate = () => transaction.checkoutSession.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => Promise.resolve({
        ...data,
        id: 31n,
        branch: { name: 'picked' },
        items: [{ productVariantId: 7n, skuSnapshot: 'SKU-7', nameSnapshot: 'Tạ tay', quantity: 3, unitPrice: new Prisma.Decimal(500000), lineTotal: new Prisma.Decimal(1500000) }],
      }),
    );

    it('routes to consultation at the branch covering most, instead of rejecting, when the chain has enough', async () => {
      findCart.mockResolvedValue(cartOfThree);
      findCheckout.mockResolvedValue(null);
      // Hà Nội còn 2, HCM còn 1: không kho nào đủ 3 nhưng cả chuỗi đủ.
      findWarehouses.mockResolvedValue([warehouse(5n, 'Hà Nội', 2), warehouse(6n, 'HCM', 1)]);
      findVariants.mockResolvedValue([{ id: 7n, sku: 'SKU-7', name: 'Tạ tay' }]);
      echoCreate();

      await expect(service.quoteGuest('cart-token', input, 'split-key', 'request-5')).resolves.toMatchObject({
        status: 'AWAITING_SHIPPING_CONSULTATION',
        requiresShippingConsultation: true,
        warehouseId: '5',
      });
      expect(shippingQuote).not.toHaveBeenCalled();
      const created = (transaction.checkoutSession.create.mock.calls[0] as [{ data: { shippingRuleSnapshot: unknown } }])[0];
      expect(created.data.shippingRuleSnapshot).toMatchObject({
        consultationReason: 'STOCK_SPLIT_ACROSS_BRANCHES',
        stockShortages: [{ productVariantId: '7', sku: 'SKU-7', requested: 3, availableAtBranch: 2 }],
      });
    });

    it('still rejects when the whole chain does not have enough stock', async () => {
      findCart.mockResolvedValue(cartOfThree);
      findCheckout.mockResolvedValue(null);
      findWarehouses.mockResolvedValue([warehouse(5n, 'Hà Nội', 1), warehouse(6n, 'HCM', 1)]);

      await expect(service.quoteGuest('cart-token', input, 'short-key', 'request-6'))
        .rejects.toBeInstanceOf(ConflictException);
      expect(transaction.checkoutSession.create).not.toHaveBeenCalled();
    });

    const principal = {
      userId: '2', sessionId: '3', displayName: 'Owner', permissionVersion: '1',
      permissions: [], scopes: [{ type: ScopeType.GLOBAL }], mustChangePassword: false,
    };
    const manualQuote = { shippingFee: '300000', etaMinDays: 2, etaMaxDays: 4, agreementNote: 'Gọi khách', expectedVersion: 0 };
    const standard = (productVariantId: bigint, quantity: number) =>
      ({ itemType: 'STANDARD', productVariantId, quantity, componentSnapshot: null });
    const splitCheckout = (items: unknown[]) => ({
      id: 31n,
      branchId: 5n,
      warehouseId: 5n,
      status: 'AWAITING_SHIPPING_CONSULTATION',
      version: 0n,
      itemSubtotal: new Prisma.Decimal(1500000),
      shippingTotal: new Prisma.Decimal(0),
      shippingRuleSnapshot: {
        consultationReason: 'STOCK_SPLIT_ACROSS_BRANCHES',
        stockShortages: [{ productVariantId: '7', sku: 'SKU-7', name: 'Tạ tay', requested: 3, availableAtBranch: 2 }],
      },
      branch: { name: 'Hà Nội' },
      items,
    });

    it('blocks staff from quoting a split checkout until the shortage is transferred in', async () => {
      transaction.checkoutSession.findUnique.mockResolvedValue(splitCheckout([standard(7n, 3)]));
      transaction.inventoryBalance.findMany.mockResolvedValue([{ productVariantId: 7n, onHand: 2, reserved: 0 }]);
      transaction.productVariant.findMany.mockResolvedValue([{ id: 7n, sku: 'SKU-7' }]);

      await expect(service.updateManualShipping('token', manualQuote, principal, 'request-7')).rejects.toMatchObject({
        response: { code: 'CHECKOUT_STOCK_NOT_TRANSFERRED' },
      });
      expect(transaction.checkoutSession.update).not.toHaveBeenCalled();
    });

    it('re-checks every cart line, not only the recorded shortage, after the transfer arrives', async () => {
      // SKU-7 đã chuyển đủ về, nhưng SKU-8 (lúc báo giá vốn đủ) nay đã bị đơn khác giữ.
      transaction.checkoutSession.findUnique.mockResolvedValue(splitCheckout([standard(7n, 3), standard(8n, 2)]));
      transaction.inventoryBalance.findMany.mockResolvedValue([
        { productVariantId: 7n, onHand: 3, reserved: 0 },
        { productVariantId: 8n, onHand: 2, reserved: 1 },
      ]);
      transaction.productVariant.findMany.mockResolvedValue([{ id: 8n, sku: 'SKU-8' }]);

      await expect(service.updateManualShipping('token', manualQuote, principal, 'request-9')).rejects.toMatchObject({
        response: { code: 'CHECKOUT_STOCK_NOT_TRANSFERRED', message: expect.stringContaining('SKU-8') as unknown },
      });
      expect(transaction.checkoutSession.update).not.toHaveBeenCalled();
    });

    it('expands combo lines into components when re-checking stock', async () => {
      const combo = { itemType: 'BUNDLE', productVariantId: 20n, quantity: 2, componentSnapshot: [{ productVariantId: '8', quantity: 2 }] };
      transaction.checkoutSession.findUnique.mockResolvedValue(splitCheckout([standard(7n, 3), combo]));
      // Combo x2, mỗi combo 2 linh kiện SKU-8 → cần 4; kho chỉ còn 3.
      transaction.inventoryBalance.findMany.mockResolvedValue([
        { productVariantId: 7n, onHand: 3, reserved: 0 },
        { productVariantId: 8n, onHand: 3, reserved: 0 },
      ]);
      transaction.productVariant.findMany.mockResolvedValue([{ id: 8n, sku: 'SKU-8' }]);

      await expect(service.updateManualShipping('token', manualQuote, principal, 'request-10')).rejects.toMatchObject({
        response: { code: 'CHECKOUT_STOCK_NOT_TRANSFERRED' },
      });
      const lookup = (transaction.inventoryBalance.findMany.mock.calls.at(-1) as [{ where: { productVariantId: { in: bigint[] } } }])[0];
      expect(lookup.where.productVariantId.in).toEqual([7n, 8n]);
    });

    it('quotes the split checkout once every line is covered at the branch', async () => {
      const checkout = splitCheckout([standard(7n, 3), standard(8n, 2)]);
      transaction.checkoutSession.findUnique.mockResolvedValue(checkout);
      transaction.inventoryBalance.findMany.mockResolvedValue([
        { productVariantId: 7n, onHand: 3, reserved: 0 },
        { productVariantId: 8n, onHand: 5, reserved: 3 },
      ]);
      transaction.checkoutSession.update.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({
        ...checkout,
        ...data,
        checkoutToken: 'token',
        version: 1n,
        items: [],
        recipientSnapshot: {},
      }));

      await expect(service.updateManualShipping('token', manualQuote, principal, 'request-11')).resolves.toMatchObject({ status: 'QUOTED' });
      expect(transaction.checkoutSession.update).toHaveBeenCalledTimes(1);
    });
  });

  it('answers 403 for a consultation outside the assigned branch', async () => {
    transaction.checkoutSession.findUnique.mockResolvedValue({ id: 40n, branchId: 9n, status: 'AWAITING_SHIPPING_CONSULTATION', version: 0n });
    const otherBranchManager = {
      userId: '2', sessionId: '3', displayName: 'Manager', permissionVersion: '1',
      permissions: [], scopes: [{ type: ScopeType.BRANCH, branchId: '3' }], mustChangePassword: false,
    };

    await expect(service.updateManualShipping('token', {
      shippingFee: '0', etaMinDays: 1, etaMaxDays: 2, agreementNote: 'x', expectedVersion: 0,
    }, otherBranchManager, 'request-8')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
