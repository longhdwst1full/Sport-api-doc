import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationConfigService } from '../../modules/system/parameters/integration-config.service';
import { SystemModule } from '../../modules/system/system.module';
import { EmailClient } from './email.client';
import { MailtrapEmailClient } from './mailtrap-email.client';

@Module({
  imports: [SystemModule],
  providers: [
    {
      provide: EmailClient,
      inject: [ConfigService, IntegrationConfigService],
      useFactory: (config: ConfigService, integrations: IntegrationConfigService): EmailClient =>
        // Cấu hình đọc tại thời điểm gửi: đổi token ở màn Admin phải có hiệu lực ngay, không chờ
        // restart. Thiếu cấu hình thì resolver trả undefined và client ném 503 rõ ràng.
        new MailtrapEmailClient(async () => {
          const mailtrap = await integrations.mailtrap();
          if (!mailtrap.token || !mailtrap.senderEmail) return undefined;
          const isProduction = config.get<string>('app.environment') === 'production';
          return {
            token: mailtrap.token,
            senderEmail: mailtrap.senderEmail,
            senderName: mailtrap.senderName || 'Bảo An Sport',
            // SECURITY: production không bao giờ đổi hướng email; đó là lớp chặn thứ hai sau
            // việc để trống tham số.
            ...(isProduction ? {} : { redirectAllTo: mailtrap.redirectAllTo || undefined }),
          };
        }),
    },
  ],
  exports: [EmailClient],
})
export class EmailModule {}
