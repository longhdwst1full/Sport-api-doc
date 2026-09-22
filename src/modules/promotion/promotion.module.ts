import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SystemModule } from '../system/system.module';
import { FlashSaleQuotaExpiryController } from './controllers/flash-sale-quota-expiry.controller';
import { AdminFlashSaleController, PublicFlashSaleController } from './controllers/flash-sale.controller';
import { FlashSaleQuotaExpiryService } from './services/flash-sale-quota-expiry.service';
import { FlashSaleService } from './services/flash-sale.service';

@Module({
  imports: [AuditModule, SystemModule],
  controllers: [PublicFlashSaleController, AdminFlashSaleController, FlashSaleQuotaExpiryController],
  providers: [FlashSaleService, FlashSaleQuotaExpiryService],
  exports: [FlashSaleService, FlashSaleQuotaExpiryService],
})
export class PromotionModule {}
