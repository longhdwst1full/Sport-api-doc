import type { PrismaService } from '../../database/prisma.service';
import type { IntegrationConfigService } from '../system/parameters/integration-config.service';
import { ConfigReadinessService } from './config-readiness.service';

/**
 * Hai sự cố production cùng một gốc: tham số khai ở nơi ứng dụng không đọc, và lỗi chỉ hiện ra ở
 * một endpoint ngẫu nhiên nhiều giờ sau. Bộ test này khoá đúng điều kiện phải báo động.
 */
const EMPTY_GHN = {
  enabled: false,
  baseUrl: '',
  token: '',
  shopId: '',
  serviceTypeId: 2,
  webhookSecret: '',
  webhookActorUserId: '',
};

function createService(overrides: Partial<Record<string, unknown>> = {}) {
  const prisma = {
    isEnabled: () => true,
    getConnectionStatus: () => Promise.resolve<'up'>('up'),
  } as unknown as PrismaService;

  const integrations = {
    ghn: jest.fn().mockResolvedValue(EMPTY_GHN),
    mailtrap: jest.fn().mockResolvedValue({
      token: '',
      senderEmail: '',
      senderName: '',
      redirectAllTo: '',
    }),
    cloudinary: jest
      .fn()
      .mockResolvedValue({ cloudName: '', apiKey: '', apiSecret: '', folder: '' }),
    vnpay: jest.fn().mockResolvedValue({
      tmnCode: '',
      hashSecret: '',
      paymentUrl: '',
      returnUrl: '',
      expireMinutes: 15,
    }),
    telegram: jest
      .fn()
      .mockResolvedValue({ enabled: false, botToken: '', allowedUserId: '', webhookSecret: '' }),
    ...overrides,
  } as unknown as IntegrationConfigService;

  return new ConfigReadinessService(prisma, integrations);
}

function capability(report: { capabilities: { name: string }[] }, name: string) {
  return report.capabilities.find((item) => item.name === name);
}

describe('ConfigReadinessService', () => {
  it('tích hợp tắt hoàn toàn không phải lỗi', async () => {
    const report = await createService().check();

    expect(report.status).toBe('ok');
    expect(capability(report, 'SHIPPING_GHN')).toMatchObject({
      status: 'DISABLED',
      missing: [],
    });
  });

  /**
   * Đây đúng là tình huống đã gây 503 ở `/shipping/areas/provinces`: cờ bật nhưng token rỗng.
   * Phải báo MISCONFIGURED và kéo cả báo cáo về `degraded`.
   */
  it('bật nhưng thiếu tham số thì báo sai cấu hình và hạ trạng thái chung', async () => {
    const service = createService({
      ghn: jest.fn().mockResolvedValue({
        ...EMPTY_GHN,
        enabled: true,
        baseUrl: 'https://dev-online-gateway.ghn.vn',
        shopId: '12345',
      }),
    });

    const report = await service.check();

    expect(report.status).toBe('degraded');
    expect(capability(report, 'SHIPPING_GHN')).toMatchObject({
      status: 'MISCONFIGURED',
      missing: ['GHN_TOKEN'],
    });
  });

  it('đủ tham số thì READY', async () => {
    const service = createService({
      ghn: jest.fn().mockResolvedValue({
        ...EMPTY_GHN,
        enabled: true,
        baseUrl: 'https://dev-online-gateway.ghn.vn',
        token: 'token',
        shopId: '12345',
      }),
    });

    const report = await service.check();

    expect(report.status).toBe('ok');
    expect(capability(report, 'SHIPPING_GHN')).toMatchObject({ status: 'READY', missing: [] });
  });

  /** Chưa đọc được tham số thì KHÔNG được báo READY — báo "ổn" khi chưa kiểm là gốc của sự cố. */
  it('lỗi đọc tham số trả UNKNOWN, không trả READY', async () => {
    const service = createService({
      ghn: jest.fn().mockRejectedValue(new Error('relation does not exist')),
    });

    const report = await service.check();

    expect(capability(report, 'SHIPPING_GHN')).toMatchObject({ status: 'UNKNOWN' });
    expect(report.status).toBe('ok');
  });

  /** SECURITY: chỉ tên tham số được đi ra ngoài, giá trị thì không. */
  it('không trả giá trị tham số, chỉ trả tên', async () => {
    const service = createService({
      vnpay: jest.fn().mockResolvedValue({
        tmnCode: 'SECRET-TMN',
        hashSecret: '',
        paymentUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
        returnUrl: '',
        expireMinutes: 15,
      }),
    });

    const report = await service.check();

    expect(JSON.stringify(report)).not.toContain('SECRET-TMN');
    expect(capability(report, 'PAYMENT_VNPAY')).toMatchObject({
      status: 'MISCONFIGURED',
      missing: ['VNPAY_HASH_SECRET', 'VNPAY_RETURN_URL'],
    });
  });

  it('database tắt là DISABLED, không phải sai cấu hình', async () => {
    const prisma = {
      isEnabled: () => false,
      getConnectionStatus: () => Promise.resolve<'disabled'>('disabled'),
    } as unknown as PrismaService;
    const service = new ConfigReadinessService(
      prisma,
      createService() as unknown as never,
    );

    const report = await service.check();

    expect(capability(report, 'DATABASE')).toMatchObject({ status: 'DISABLED' });
  });
});
