import { Module } from '@nestjs/common';
import { AdminProductsController } from './controllers/admin-products.controller';
import { CatalogController } from './controllers/catalog.controller';
import { ProductsService } from './services/products.service';

@Module({
  controllers: [CatalogController, AdminProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
