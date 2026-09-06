import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { AuditModule } from '../audit/audit.module';
import { InventoryQueryService } from './inventory-query.service';

@Module({
  imports: [AuditModule],
  controllers: [InventoryController],
  providers: [InventoryService, InventoryQueryService],
})
export class InventoryModule {}
