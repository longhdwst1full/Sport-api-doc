import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { AuditModule } from '../audit/audit.module';
import { InventoryQueryService } from './inventory-query.service';
import { StockTransferController } from './stock-transfer.controller';
import { StockTransferQueryService } from './stock-transfer-query.service';
import { StockTransferService } from './stock-transfer.service';

@Module({
  imports: [AuditModule],
  controllers: [InventoryController, StockTransferController],
  providers: [InventoryService, InventoryQueryService, StockTransferService, StockTransferQueryService],
})
export class InventoryModule {}
