import { Module } from '@nestjs/common';
import { AttributesModule } from './attributes/attributes.module';
import { ProductsModule } from './products/products.module';
import { CatalogMasterModule } from './master-data/catalog-master.module';

@Module({
  imports: [CatalogMasterModule, AttributesModule, ProductsModule],
  exports: [CatalogMasterModule, AttributesModule, ProductsModule],
})
export class CatalogModule {}
