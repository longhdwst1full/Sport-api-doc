import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { CatalogCategoriesController } from './catalog-categories.controller';
import { CatalogMasterController } from './catalog-master.controller';
import { CatalogMasterService } from './catalog-master.service';

@Module({
  imports: [AuditModule],
  controllers: [CatalogMasterController, CatalogCategoriesController],
  providers: [CatalogMasterService],
  exports: [CatalogMasterService],
})
export class CatalogMasterModule {}
