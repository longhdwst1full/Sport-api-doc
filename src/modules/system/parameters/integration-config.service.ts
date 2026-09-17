import { Injectable } from '@nestjs/common';
import { SYSTEM_PARAMETER_CODE } from './system-parameter.catalog';
import { SystemParameterService } from './system-parameter.service';

export interface GhnConfig {
  enabled: boolean;
  baseUrl: string;
  token: string;
  shopId: string;
  serviceTypeId: number;
  webhookSecret: string;
  webhookActorUserId: string;
}

export interface MailtrapConfig {
  token: string;
  senderEmail: string;
  senderName: string;
  redirectAllTo: string;
}

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  folder: string;
}

export interface TelegramConfig {
  enabled: boolean;
  botToken: string;
  allowedUserId: string;
  webhookSecret: string;
}

export interface VnpayConfig {
  tmnCode: string;
  hashSecret: string;
  paymentUrl: string;
  returnUrl: string;
  expireMinutes: number;
}

/**
 * Cấu hình tích hợp đọc từ bảng tham số, biến môi trường là fallback.
 *
 * Phải đọc tại thời điểm dùng chứ không phải lúc khởi tạo module: giá trị đổi từ màn Admin phải
 * có hiệu lực ngay, còn factory chạy một lần lúc bootstrap sẽ giữ mãi giá trị cũ cho tới khi
 * restart. `SystemParameterService` đã cache 30 giây nên đọc mỗi lần dùng không thành truy vấn.
 */
@Injectable()
export class IntegrationConfigService {
  constructor(private readonly parameters: SystemParameterService) {}

  async ghn(): Promise<GhnConfig> {
    const [enabled, baseUrl, token, shopId, serviceTypeId, webhookSecret, webhookActorUserId] =
      await Promise.all([
        this.parameters.getBoolean(SYSTEM_PARAMETER_CODE.GHN_ENABLED),
        this.parameters.getString(SYSTEM_PARAMETER_CODE.GHN_BASE_URL),
        this.parameters.getString(SYSTEM_PARAMETER_CODE.GHN_TOKEN),
        this.parameters.getString(SYSTEM_PARAMETER_CODE.GHN_SHOP_ID),
        this.parameters.getInteger(SYSTEM_PARAMETER_CODE.GHN_SERVICE_TYPE_ID),
        this.parameters.getString(SYSTEM_PARAMETER_CODE.GHN_WEBHOOK_SECRET),
        this.parameters.getString(SYSTEM_PARAMETER_CODE.GHN_WEBHOOK_ACTOR_USER_ID),
      ]);
    return {
      enabled,
      // Bỏ dấu gạch chéo cuối để ghép đường dẫn không sinh ra `//`.
      baseUrl: baseUrl.trim().replace(/\/+$/, ''),
      token: token.trim(),
      shopId: shopId.trim(),
      serviceTypeId,
      webhookSecret: webhookSecret.trim(),
      webhookActorUserId: webhookActorUserId.trim(),
    };
  }

  async mailtrap(): Promise<MailtrapConfig> {
    const [token, senderEmail, senderName, redirectAllTo] = await Promise.all([
      this.parameters.getString(SYSTEM_PARAMETER_CODE.MAILTRAP_API_TOKEN),
      this.parameters.getString(SYSTEM_PARAMETER_CODE.MAILTRAP_SENDER_EMAIL),
      this.parameters.getString(SYSTEM_PARAMETER_CODE.MAILTRAP_SENDER_NAME),
      this.parameters.getString(SYSTEM_PARAMETER_CODE.MAILTRAP_REDIRECT_ALL_TO),
    ]);
    return {
      token: token.trim(),
      senderEmail: senderEmail.trim(),
      senderName: senderName.trim(),
      redirectAllTo: redirectAllTo.trim(),
    };
  }

  async cloudinary(): Promise<CloudinaryConfig> {
    const [cloudName, apiKey, apiSecret, folder] = await Promise.all([
      this.parameters.getString(SYSTEM_PARAMETER_CODE.CLOUDINARY_CLOUD_NAME),
      this.parameters.getString(SYSTEM_PARAMETER_CODE.CLOUDINARY_API_KEY),
      this.parameters.getString(SYSTEM_PARAMETER_CODE.CLOUDINARY_API_SECRET),
      this.parameters.getString(SYSTEM_PARAMETER_CODE.CLOUDINARY_FOLDER),
    ]);
    return {
      cloudName: cloudName.trim(),
      apiKey: apiKey.trim(),
      apiSecret: apiSecret.trim(),
      folder: folder.trim(),
    };
  }

  async telegram(): Promise<TelegramConfig> {
    const [enabled, botToken, allowedUserId, webhookSecret] = await Promise.all([
      this.parameters.getBoolean(SYSTEM_PARAMETER_CODE.TELEGRAM_BOT_ENABLED),
      this.parameters.getString(SYSTEM_PARAMETER_CODE.TELEGRAM_BOT_TOKEN),
      this.parameters.getString(SYSTEM_PARAMETER_CODE.TELEGRAM_ALLOWED_USER_ID),
      this.parameters.getString(SYSTEM_PARAMETER_CODE.TELEGRAM_WEBHOOK_SECRET),
    ]);
    return {
      enabled,
      botToken: botToken.trim(),
      allowedUserId: allowedUserId.trim(),
      webhookSecret: webhookSecret.trim(),
    };
  }

  async vnpay(): Promise<VnpayConfig> {
    const [tmnCode, hashSecret, paymentUrl, returnUrl, expireMinutes] = await Promise.all([
      this.parameters.getString(SYSTEM_PARAMETER_CODE.VNPAY_TMN_CODE),
      this.parameters.getString(SYSTEM_PARAMETER_CODE.VNPAY_HASH_SECRET),
      this.parameters.getString(SYSTEM_PARAMETER_CODE.VNPAY_PAYMENT_URL),
      this.parameters.getString(SYSTEM_PARAMETER_CODE.VNPAY_RETURN_URL),
      this.parameters.getInteger(SYSTEM_PARAMETER_CODE.VNPAY_EXPIRE_MINUTES),
    ]);
    return {
      tmnCode: tmnCode.trim(),
      hashSecret: hashSecret.trim(),
      paymentUrl: paymentUrl.trim(),
      returnUrl: returnUrl.trim(),
      expireMinutes,
    };
  }
}
