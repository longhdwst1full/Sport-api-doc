import { Module } from '@nestjs/common';
import { ProductsModule } from './products/products.module';
import { CatalogMasterModule } from './master-data/catalog-master.module';

@Module({
  imports: [CatalogMasterModule, ProductsModule],
  exports: [CatalogMasterModule, ProductsModule],
})
export class CatalogModule {}
