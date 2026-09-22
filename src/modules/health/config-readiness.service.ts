import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { IntegrationConfigService } from '../system/parameters/integration-config.service';
import type { CapabilityReadinessDto, ConfigReadinessDto } from './health.dto';

/**
 * Kiểm cấu hình bắt buộc của từng năng lực tích hợp.
 *
 * Lý do tồn tại: hai sự cố production đều cùng một gốc — tham số khai ở nơi ứng dụng không đọc,
 * và lỗi chỉ hiện ra ở một endpoint ngẫu nhiên nhiều giờ sau đó (`/shipping/areas/provinces` trả
 * 503, phiên đăng nhập bị đá ra). Thiếu cấu hình phải nói ngay lúc khởi động và phải tra được
 * bằng một lời gọi, thay vì chờ người dùng vấp phải.
 *
 * SECURITY: chỉ trả **tên** tham số còn thiếu, không bao giờ trả giá trị. Endpoint này còn được
 * gác bằng quyền `system.parameter.view`, vì danh sách tích hợp đang bật cũng là thông tin hệ thống.
 */
@Injectable()
export class ConfigReadinessService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ConfigReadinessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationConfigService,
  ) {}

  /**
   * Cảnh báo ngay khi khởi động.
   *
   * Chỉ ghi log, KHÔNG chặn khởi động: một tích hợp chưa cấu hình không được làm sập cả API, và
   * tiến trình sinh OpenAPI vốn chạy với database tắt.
   */
  async onApplicationBootstrap(): Promise<void> {
    const report = await this.check();
    const broken = report.capabilities.filter((item) => item.status === 'MISCONFIGURED');
    if (broken.length === 0) {
      this.logger.log(`Cấu hình tích hợp: ${report.status}`);
      return;
    }
    for (const item of broken) {
      this.logger.warn(
        `Tích hợp ${item.name} đang BẬT nhưng thiếu tham số: ${item.missing.join(', ')}`,
      );
    }
  }

  async check(): Promise<ConfigReadinessDto> {
    const capabilities = [
      await this.database(),
      ...(await Promise.all([
        this.capability('SHIPPING_GHN', () => this.ghn()),
        this.capability('EMAIL_MAILTRAP', () => this.mailtrap()),
        this.capability('OBJECT_STORAGE_CLOUDINARY', () => this.cloudinary()),
        this.capability('PAYMENT_VNPAY', () => this.vnpay()),
        this.capability('TELEGRAM', () => this.telegram()),
      ])),
    ];

    return {
      // MISCONFIGURED là thứ cần người sửa ngay; DISABLED là lựa chọn vận hành, không phải lỗi.
      status: capabilities.some((item) => item.status === 'MISCONFIGURED') ? 'degraded' : 'ok',
      capabilities,
      timestamp: new Date().toISOString(),
    };
  }

  private async database(): Promise<CapabilityReadinessDto> {
    if (!this.prisma.isEnabled()) {
      return {
        name: 'DATABASE',
        enabled: false,
        status: 'DISABLED',
        missing: ['DATABASE_ENABLED'],
      };
    }
    const status = await this.prisma.getConnectionStatus();
    return {
      name: 'DATABASE',
      enabled: true,
      status: status === 'up' ? 'READY' : 'MISCONFIGURED',
      missing: status === 'up' ? [] : ['DATABASE_URL'],
    };
  }

  /**
   * Một năng lực chỉ bị coi là sai cấu hình khi nó ĐANG BẬT mà thiếu tham số.
   *
   * Lỗi khi đọc tham số (database chưa lên, bảng chưa migrate) trả `UNKNOWN` chứ không trả READY:
   * báo "ổn" khi chưa kiểm được là đúng kiểu sai đã dẫn tới hai sự cố trên.
   */
  private async capability(
    name: string,
    read: () => Promise<{ enabled: boolean; missing: string[] }>,
  ): Promise<CapabilityReadinessDto> {
    try {
      const { enabled, missing } = await read();
      if (!enabled) return { name, enabled: false, status: 'DISABLED', missing: [] };
      return {
        name,
        enabled: true,
        status: missing.length === 0 ? 'READY' : 'MISCONFIGURED',
        missing,
      };
    } catch {
      return { name, enabled: false, status: 'UNKNOWN', missing: [] };
    }
  }

  private async ghn(): Promise<{ enabled: boolean; missing: string[] }> {
    const config = await this.integrations.ghn();
    return {
      enabled: config.enabled,
      missing: missingKeys({
        GHN_BASE_URL: config.baseUrl,
        GHN_TOKEN: config.token,
        GHN_SHOP_ID: config.shopId,
      }),
    };
  }

  private async mailtrap(): Promise<{ enabled: boolean; missing: string[] }> {
    const config = await this.integrations.mailtrap();
    // Không có cờ bật/tắt riêng: có token nghĩa là đang dùng.
    return {
      enabled: Boolean(config.token),
      missing: missingKeys({
        MAILTRAP_API_TOKEN: config.token,
        MAILTRAP_SENDER_EMAIL: config.senderEmail,
      }),
    };
  }

  private async cloudinary(): Promise<{ enabled: boolean; missing: string[] }> {
    const config = await this.integrations.cloudinary();
    return {
      enabled: Boolean(config.cloudName || config.apiKey || config.apiSecret),
      missing: missingKeys({
        CLOUDINARY_CLOUD_NAME: config.cloudName,
        CLOUDINARY_API_KEY: config.apiKey,
        CLOUDINARY_API_SECRET: config.apiSecret,
      }),
    };
  }

  private async vnpay(): Promise<{ enabled: boolean; missing: string[] }> {
    const config = await this.integrations.vnpay();
    return {
      enabled: Boolean(config.tmnCode || config.hashSecret),
      missing: missingKeys({
        VNPAY_TMN_CODE: config.tmnCode,
        VNPAY_HASH_SECRET: config.hashSecret,
        VNPAY_PAYMENT_URL: config.paymentUrl,
        VNPAY_RETURN_URL: config.returnUrl,
      }),
    };
  }

  private async telegram(): Promise<{ enabled: boolean; missing: string[] }> {
    const config = await this.integrations.telegram();
    return {
      enabled: config.enabled,
      missing: missingKeys({
        TELEGRAM_BOT_TOKEN: config.botToken,
        TELEGRAM_ALLOWED_USER_ID: config.allowedUserId,
      }),
    };
  }
}

/** Tên các tham số đang rỗng. Giá trị không bao giờ đi ra khỏi hàm này. */
function missingKeys(values: Record<string, string>): string[] {
  return Object.entries(values)
    .filter(([, value]) => !value.trim())
    .map(([key]) => key);
}
