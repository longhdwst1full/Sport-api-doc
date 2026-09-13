import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AdminFulfillmentController } from './controllers/fulfillment.controller';
import { FulfillmentService } from './services/fulfillment.service';

@Module({
  imports: [AuditModule],
  controllers: [AdminFulfillmentController],
  providers: [FulfillmentService],
  exports: [FulfillmentService],
})
export class FulfillmentModule {}
