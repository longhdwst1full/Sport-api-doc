import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notification/notification.module';
import { SystemModule } from '../system/system.module';
import { AccountReturnController, AdminReturnController } from './controllers/return.controller';
import { RefundService } from './services/refund.service';
import { ReturnStore } from './services/return-store';
import { ReturnService } from './services/return.service';

@Module({
  imports: [AuditModule, NotificationModule, SystemModule],
  controllers: [AccountReturnController, AdminReturnController],
  providers: [ReturnStore, ReturnService, RefundService],
})
export class ReturnModule {}
