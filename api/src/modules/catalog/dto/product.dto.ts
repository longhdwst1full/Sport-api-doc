import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class ProductSummaryDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'Máy chạy bộ DCTD Pro X1' }) name: string;
  @ApiProperty({ example: 'may-chay-bo-dctd-pro-x1' }) slug: string;
  @ApiProperty({ example: 'DCTD' }) brand: string;
  @ApiProperty({ example: 'Máy chạy bộ' }) category: string;
  @ApiProperty({ example: 18990000 }) price: number;
  @ApiProperty({ example: 'VND' }) currency: string;
  @ApiProperty({ format: 'uri' }) imageUrl: string;
  @ApiProperty({ example: 4.8 }) rating: number;
  @ApiProperty({ example: 124 }) reviewCount: number;
  @ApiProperty({ example: true }) available: boolean;
  @ApiProperty({ type: [String], example: ['Bán chạy', 'Giao nhanh'] }) tags: string[];
}

export class ProductVariantDto {
  @ApiProperty() id: string;
  @ApiProperty() sku: string;
  @ApiProperty() name: string;
  @ApiProperty() price: number;
  @ApiProperty() availableQuantity: number;
  @ApiProperty({ type: Object }) attributes: Record<string, string>;
}

export class BundleComponentDto {
  @ApiProperty() componentSku: string;
  @ApiProperty() componentName: string;
  @ApiProperty({ minimum: 1 }) quantity: number;
}

export class ProductBundleDto {
  @ApiProperty({ enum: ['FIXED'] }) bundleType: 'FIXED';
  @ApiProperty({ type: [BundleComponentDto] }) components: BundleComponentDto[];
}

export class ProductDetailDto extends ProductSummaryDto {
  @ApiProperty() description: string;
  @ApiProperty({ example: 'SKU-RUN-X1' }) sku: string;
  @ApiProperty({ example: 12 }) availableQuantity: number;
  @ApiProperty({ type: [String] }) gallery: string[];
  @ApiProperty({ type: [ProductVariantDto] }) variants: ProductVariantDto[];
  @ApiPropertyOptional({ type: ProductBundleDto }) bundle?: ProductBundleDto;
}

export class ProductListMetaDto {
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 12 }) limit: number;
  @ApiProperty({ example: 2 }) total: number;
  @ApiProperty({ example: 1 }) totalPages: number;
}

export class ProductListResponseDto {
  @ApiProperty({ type: [ProductSummaryDto] }) items: ProductSummaryDto[];
  @ApiProperty({ type: ProductListMetaDto }) meta: ProductListMetaDto;
}

export class ListProductsQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page: number = 1;

  @ApiPropertyOptional({ default: 12, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit: number = 12;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  category?: string;
}

export class CreateProductDto {
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiProperty() @IsString() @IsNotEmpty() slug: string;
  @ApiProperty() @IsString() @IsNotEmpty() sku: string;
  @ApiProperty() @IsString() @IsNotEmpty() brand: string;
  @ApiProperty() @IsString() @IsNotEmpty() category: string;
  @ApiProperty() @IsString() description: string;
  @ApiProperty({ minimum: 0 }) @IsNumber() @Min(0) price: number;
  @ApiProperty({ format: 'uri' }) @IsUrl() imageUrl: string;
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) availableQuantity: number;
  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];
  @ApiPropertyOptional({ default: true }) @IsBoolean() @IsOptional() published?: boolean;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}
