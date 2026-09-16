import { Module } from '@nestjs/common';
import { EmailModule } from '../../integrations/email/email.module';

/**
 * Notification là SCAFFOLDED: đã có cổng gửi email nhưng chưa có use case nghiệp vụ nào.
 * Module nào cần gửi mail thì import module này và inject `EmailClient`.
 */
@Module({
  imports: [EmailModule],
  exports: [EmailModule],
})
export class NotificationModule {}
