import { Module } from '@nestjs/common';
import { AdminProductsController } from './interfaces/admin-products.controller';
import { CatalogController } from './interfaces/catalog.controller';
import { ProductsService } from './products.service';

@Module({
  controllers: [CatalogController, AdminProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class CatalogModule {}
