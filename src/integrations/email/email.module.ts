import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DisabledEmailClient } from './disabled-email.client';
import { EmailClient } from './email.client';
import { MailtrapEmailClient } from './mailtrap-email.client';

@Module({
  providers: [
    {
      provide: EmailClient,
      inject: [ConfigService],
      useFactory: (config: ConfigService): EmailClient => {
        const token = config.get<string>('mailtrap.token');
        const senderEmail = config.get<string>('mailtrap.senderEmail');
        // Thiếu cấu hình thì rơi về client báo lỗi rõ ràng, giống ObjectStorageModule,
        // để OpenAPI generation và test chạy được mà không cần khoá provider.
        if (!token || !senderEmail) return new DisabledEmailClient();

        const isProduction = config.get<string>('app.environment') === 'production';
        const redirectAllTo = config.get<string>('mailtrap.redirectAllTo');

        return new MailtrapEmailClient({
          token,
          senderEmail,
          senderName: config.get<string>('mailtrap.senderName') ?? 'Bảo An Sport',
          ...(isProduction ? {} : { redirectAllTo }),
        });
      },
    },
  ],
  exports: [EmailClient],
})
export class EmailModule {}
