import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notification/notification.module';
import { ObjectStorageModule } from '../../integrations/object-storage/object-storage.module';
import { SystemModule } from '../system/system.module';
import { AccountReturnController, AdminReturnController } from './controllers/return.controller';
import { RefundService } from './services/refund.service';
import { ReturnEvidenceService } from './services/return-evidence.service';
import { ReturnStore } from './services/return-store';
import { ReturnService } from './services/return.service';

@Module({
  imports: [AuditModule, NotificationModule, SystemModule, ObjectStorageModule],
  controllers: [AccountReturnController, AdminReturnController],
  providers: [ReturnStore, ReturnService, RefundService, ReturnEvidenceService],
})
export class ReturnModule {}
