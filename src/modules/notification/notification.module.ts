import { Module } from '@nestjs/common';
import { EmailModule } from '../../integrations/email/email.module';
import { SystemModule } from '../system/system.module';
import { NotificationMaintenanceController } from './notification-maintenance.controller';
import { OutboxDispatcherService } from './outbox-dispatcher.service';
import { OutboxWriter } from './outbox.writer';

/**
 * Gửi thông báo qua hàng đợi outbox.
 *
 * Module nghiệp vụ chỉ cần `OutboxWriter` và ghi ý định trong transaction của mình; việc gửi thật
 * do worker ở đây lo. Không module nào được inject `EmailClient` trực tiếp nữa — gửi thẳng trong
 * transaction nghiệp vụ là cách để mất email khi nhà cung cấp lỗi, hoặc rollback cả đơn hàng vì
 * một lần gửi mail hỏng.
 */
@Module({
  imports: [EmailModule, SystemModule],
  controllers: [NotificationMaintenanceController],
  providers: [OutboxWriter, OutboxDispatcherService],
  exports: [OutboxWriter],
})
export class NotificationModule {}
