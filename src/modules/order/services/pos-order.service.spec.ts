import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import type { AuthPrincipal } from '../../auth/auth.types';
import { AuditWriter } from '../../audit/audit.writer';
import { InventoryReservationService } from '../../checkout/inventory-reservation.service';
import { FulfillmentService } from '../../fulfillment/services/fulfillment.service';
import { ScopeType } from '../../iam/iam.types';
import { FlashSaleService } from '../../promotion/services/flash-sale.service';
import { OrderService } from './order.service';
import { PosOrderService, resolveOrderCreationPlan } from './pos-order.service';

/**
 * Combo không có dòng tồn kho riêng — tồn nằm ở thành phần và bước đặt chỗ cũng nổ combo
 * ra thành phần trước khi giữ hàng. Các test dưới chốt rằng màn quầy và bước kiểm tồn sớm
 * dùng cùng một cách quy đổi, thay vì tra thẳng tồn của biến thể combo (luôn ra 0).
 */
describe('PosOrderService tồn khả dụng', () => {
  const GIAN_TA = { id: 10n, sku: 'HQ-909S', bundleDefinition: null };
  const COMBO = {
    id: 20n,
    sku: 'COMBO-GYM',
    bundleDefinition: {
      items: [
        { componentVariantId: 10n, quantity: 2 },
        { componentVariantId: 11n, quantity: 1 },
      ],
    },
  };

  function buildService(options: {
    variants: unknown[];
    balances: Array<{ productVariantId: bigint; onHand: number; reserved: number }>;
    /** Suất flash đang chạy, khoá theo id biến thể. Bỏ trống là không có chương trình nào. */
    deals?: Map<bigint, { salePrice: { toFixed: () => string }; availableQuantity: number }>;
  }) {
    const prisma = {
      isEnabled: jest.fn().mockReturnValue(true),
      warehouse: { findFirst: jest.fn().mockResolvedValue({ id: 99n, branchId: 3n }) },
      productVariant: {
        findMany: jest.fn().mockResolvedValue(options.variants),
        count: jest.fn().mockResolvedValue(options.variants.length),
      },
      inventoryBalance: { findMany: jest.fn().mockResolvedValue(options.balances) },
      $transaction: jest.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
    } as unknown as PrismaService;

    return new PosOrderService(
      prisma,
      {} as OrderService,
      {} as InventoryReservationService,
      {} as FulfillmentService,
      {
        resolveActiveDeals: jest.fn().mockResolvedValue(options.deals ?? new Map()),
      } as unknown as FlashSaleService,
      {} as AuditWriter,
    );
  }

  const principal: AuthPrincipal = {
    userId: '1',
    sessionId: '1',
    displayName: 'Nhân viên quầy',
    permissionVersion: '1',
    permissions: ['order.manage'],
    scopes: [{ type: ScopeType.BRANCH, branchId: '3' }],
    mustChangePassword: false,
  };

  it('hàng lẻ lấy tồn đã trừ phần đang giữ', async () => {
    const service = buildService({
      variants: [{ ...GIAN_TA, name: 'Giàn tạ', prices: [{ amount: { toFixed: () => '16000000.00' } }] }],
      balances: [{ productVariantId: 10n, onHand: 25, reserved: 4 }],
    });

    const result = await service.searchCatalog({ page: 1, limit: 20 }, principal);

    expect(result.items[0]).toMatchObject({ sku: 'HQ-909S', isBundle: false, availableQuantity: 21 });
  });

  /**
   * Combo 1 cụm = 2 giàn tạ + 1 thảm. Còn 21 giàn tạ (đủ 10 cụm) nhưng chỉ 3 thảm
   * (đủ 3 cụm) thì bán được 3 cụm — thành phần thiếu nhất quyết định.
   */
  it('combo lấy theo thành phần thiếu nhất, không phải tồn của chính combo', async () => {
    const service = buildService({
      variants: [{ ...COMBO, name: 'Combo gym', prices: [], bundleDefinition: {
        items: [
          { quantity: 2, componentVariant: { id: 10n, sku: 'HQ-909S', name: 'Giàn tạ' } },
          { quantity: 1, componentVariant: { id: 11n, sku: 'THAM-YOGA', name: 'Thảm' } },
        ],
      } }],
      balances: [
        { productVariantId: 10n, onHand: 25, reserved: 4 },
        { productVariantId: 11n, onHand: 3, reserved: 0 },
      ],
    });

    const result = await service.searchCatalog({ page: 1, limit: 20 }, principal);

    expect(result.items[0]).toMatchObject({
      sku: 'COMBO-GYM',
      isBundle: true,
      availableQuantity: 3,
      unitPrice: null,
    });
    expect(result.items[0].components).toHaveLength(2);
  });

  it('biến thể chưa có dòng tồn nào coi như hết hàng, không phải lỗi', async () => {
    const service = buildService({
      variants: [{ ...GIAN_TA, name: 'Giàn tạ', prices: [] }],
      balances: [],
    });

    const result = await service.searchCatalog({ page: 1, limit: 20 }, principal);

    expect(result.items[0].availableQuantity).toBe(0);
  });

  /**
   * Khách tới quầy được cùng giá với web. Trước đây chỉ Backend biết giá flash: nhân viên đọc giá
   * gốc cho khách, hoá đơn in ra số thấp hơn và không ai giải thích được chênh lệch.
   */
  it('danh mục quầy trả kèm giá flash và số suất còn lại', async () => {
    const service = buildService({
      variants: [
        { ...GIAN_TA, name: 'Giàn tạ', prices: [{ amount: { toFixed: () => '16000000.00' } }] },
      ],
      balances: [{ productVariantId: 10n, onHand: 25, reserved: 4 }],
      deals: new Map([
        [10n, { salePrice: { toFixed: () => '13900000.00' }, availableQuantity: 4 }],
      ]),
    });

    const result = await service.searchCatalog({ page: 1, limit: 20 }, principal);

    expect(result.items[0].unitPrice).toBe('16000000.00');
    expect(result.items[0].flashPrice).toBe('13900000.00');
    expect(result.items[0].flashSaleAvailableQuantity).toBe(4);
  });

  it('không có chương trình nào thì hai trường flash để null, không phải 0', async () => {
    const service = buildService({
      variants: [
        { ...GIAN_TA, name: 'Giàn tạ', prices: [{ amount: { toFixed: () => '16000000.00' } }] },
      ],
      balances: [{ productVariantId: 10n, onHand: 25, reserved: 4 }],
    });

    const result = await service.searchCatalog({ page: 1, limit: 20 }, principal);

    expect(result.items[0].flashPrice).toBeNull();
    expect(result.items[0].flashSaleAvailableQuantity).toBeNull();
  });

  it('kiểm tồn sớm khi tạo đơn từ chối combo vượt số cụm ghép được', async () => {
    // `assertAvailable` chỉ cần cấu trúc combo phẳng, không cần tên/giá như màn danh mục.
    const service = buildService({
      variants: [COMBO],
      balances: [
        { productVariantId: 10n, onHand: 25, reserved: 4 },
        { productVariantId: 11n, onHand: 3, reserved: 0 },
      ],
    });

    await expect(
      service.create(
        {
          customer: { name: 'Khách', phone: '0900000000' },
          items: [{ productVariantId: '20', quantity: 4 }],
          paymentMethod: 'CASH',
        },
        'key-1',
        'req-1',
        principal,
      ),
    ).rejects.toThrow(
      new ConflictException('Kho quầy không đủ hàng cho COMBO-GYM: còn 3, cần 4'),
    );
  });
});

describe('Quy tắc lập đơn của nhân viên', () => {
  const delivery = {
    recipient: 'Nguyễn Văn An',
    phone: '0901234567',
    addressLine: '12 Nguyễn Trãi',
    province: 'Hà Nội',
    provinceCode: '201',
  };

  it('đơn tại quầy: thu tiền ngay và giao ngay', () => {
    expect(resolveOrderCreationPlan({ paymentMethod: 'CASH' })).toEqual({
      settleNow: true,
      handOverNow: true,
      shippingMethod: 'BRANCH_FREE',
    });
  });

  it('đơn giao hàng: không tự giao, để kho xử lý theo luồng thường', () => {
    expect(resolveOrderCreationPlan({ paymentMethod: 'BANK_TRANSFER', delivery })).toMatchObject({
      handOverNow: false,
      shippingMethod: 'STANDARD_DELIVERY',
    });
  });

  it('COD không ghi nhận đã thu vì tiền thu lúc giao', () => {
    expect(resolveOrderCreationPlan({ paymentMethod: 'COD', delivery }).settleNow).toBe(false);
  });

  it('chuyển khoản tại quầy vẫn ghi nhận đã thu', () => {
    expect(resolveOrderCreationPlan({ paymentMethod: 'BANK_TRANSFER' }).settleNow).toBe(true);
  });

  it('nhân viên chọn khách lấy luôn thì đơn giao hàng vẫn chạy hết vòng', () => {
    expect(
      resolveOrderCreationPlan({
        paymentMethod: 'CASH',
        delivery,
        handOverImmediately: true,
      }).handOverNow,
    ).toBe(true);
  });

  it('chọn không giao ngay thì đơn tại quầy cũng dừng lại chờ xử lý', () => {
    expect(
      resolveOrderCreationPlan({ paymentMethod: 'CASH', handOverImmediately: false }).handOverNow,
    ).toBe(false);
  });
});
