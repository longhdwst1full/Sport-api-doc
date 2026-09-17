import { IntegrationConfigService } from './integration-config.service';
import type { SystemParameterService } from './system-parameter.service';

function buildParameters(values: Record<string, string>): SystemParameterService {
  return {
    getString: (code: string) => Promise.resolve(values[code] ?? ''),
    getBoolean: (code: string) => Promise.resolve(values[code] === 'true'),
    getInteger: (code: string) => Promise.resolve(Number(values[code] ?? 0)),
  } as unknown as SystemParameterService;
}

describe('IntegrationConfigService', () => {
  it('cắt dấu gạch chéo cuối của base URL để không ghép thành //', async () => {
    const service = new IntegrationConfigService(
      buildParameters({ GHN_BASE_URL: 'https://example.test/shiip/public-api/  ' }),
    );

    await expect(service.ghn()).resolves.toMatchObject({
      baseUrl: 'https://example.test/shiip/public-api',
    });
  });

  it('trim mọi giá trị vì người dùng hay dán kèm khoảng trắng', async () => {
    const service = new IntegrationConfigService(
      buildParameters({ MAILTRAP_API_TOKEN: '  abc123  ', MAILTRAP_SENDER_EMAIL: ' a@b.test ' }),
    );

    await expect(service.mailtrap()).resolves.toMatchObject({
      token: 'abc123',
      senderEmail: 'a@b.test',
    });
  });

  it('đọc được cấu hình của cả năm nhà cung cấp', async () => {
    const service = new IntegrationConfigService(
      buildParameters({
        GHN_ENABLED: 'true',
        TELEGRAM_BOT_ENABLED: 'true',
        CLOUDINARY_CLOUD_NAME: 'demo',
        VNPAY_TMN_CODE: 'X7EIXQ59',
        VNPAY_EXPIRE_MINUTES: '30',
      }),
    );

    expect((await service.ghn()).enabled).toBe(true);
    expect((await service.telegram()).enabled).toBe(true);
    expect((await service.cloudinary()).cloudName).toBe('demo');
    expect((await service.vnpay())).toMatchObject({ tmnCode: 'X7EIXQ59', expireMinutes: 30 });
  });
});
