import { Module } from '@nestjs/common';
import { ProductsModule } from './products/products.module';

@Module({
  imports: [ProductsModule],
  exports: [ProductsModule],
})
export class CatalogModule {}
