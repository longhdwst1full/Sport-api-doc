import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AdminFlashSaleController, PublicFlashSaleController } from './controllers/flash-sale.controller';
import { FlashSaleService } from './services/flash-sale.service';

@Module({
  imports: [AuditModule],
  controllers: [PublicFlashSaleController, AdminFlashSaleController],
  providers: [FlashSaleService],
  exports: [FlashSaleService],
})
export class PromotionModule {}
