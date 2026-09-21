import { Module } from '@nestjs/common';
import { AdminProductsController } from './controllers/admin-products.controller';
import { CatalogController } from './controllers/catalog.controller';
import { ProductsService } from './services/products.service';
import { ProductMediaService } from './services/product-media.service';
import { AuditModule } from '../../audit/audit.module';
import { ObjectStorageModule } from '../../../integrations/object-storage/object-storage.module';

@Module({
  imports: [AuditModule, ObjectStorageModule],
  controllers: [CatalogController, AdminProductsController],
  providers: [ProductsService, ProductMediaService],
  exports: [ProductsService],
})
export class ProductsModule {}
