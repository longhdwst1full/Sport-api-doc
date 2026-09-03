import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  PRODUCT_BUNDLE_STATUS,
  PRODUCT_BUNDLE_TYPE,
  PRODUCT_CURRENCY,
  PRODUCT_MEDIA_STATUS,
  PRODUCT_STATUS,
  PRODUCT_TYPE,
  PRODUCT_VARIANT_STATUS,
  ProductStatus,
  ProductMediaStatus,
  ProductType,
  ProductVariantStatus,
} from '../product.constants';

export class ProductVariantDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() sku: string;
  @ApiPropertyOptional() barcode?: string;
  @ApiProperty() name: string;
  @ApiProperty({ minimum: 0 }) weightGrams: number;
  @ApiPropertyOptional({ type: Number, minimum: 1, nullable: true }) lengthMm?: number | null;
  @ApiPropertyOptional({ type: Number, minimum: 1, nullable: true }) widthMm?: number | null;
  @ApiPropertyOptional({ type: Number, minimum: 1, nullable: true }) heightMm?: number | null;
  @ApiProperty({ enum: Object.values(PRODUCT_VARIANT_STATUS) }) status: ProductVariantStatus;
  @ApiProperty({ example: 0 }) version: number;
  @ApiPropertyOptional({ type: String, example: '18990000.00', nullable: true }) effectivePrice?: string | null;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true }) effectivePriceId?: string | null;
  @ApiPropertyOptional({ type: Number, example: 0, nullable: true }) effectivePriceVersion?: number | null;
  @ApiPropertyOptional({ type: () => ProductBundleDto, nullable: true }) bundle?: ProductBundleDto | null;
}

export class ProductMediaDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) mediaAssetId: string;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) variantId?: string | null;
  @ApiProperty({ format: 'uri' }) secureUrl: string;
  @ApiPropertyOptional({ type: String, format: 'uri', nullable: true }) thumbnailUrl?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) altText?: string | null;
  @ApiProperty({ minimum: 0 }) sortOrder: number;
  @ApiProperty() isPrimary: boolean;
  @ApiProperty({ enum: Object.values(PRODUCT_MEDIA_STATUS) }) status: ProductMediaStatus;
}

export class ProductCategoryDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty() isPrimary: boolean;
}

export class BundleComponentDto {
  @ApiProperty({ format: 'uuid' }) componentVariantId: string;
  @ApiProperty() componentSku: string;
  @ApiProperty() componentName: string;
  @ApiProperty({ minimum: 1 }) quantity: number;
}

export class ProductBundleDto {
  @ApiProperty({ enum: Object.values(PRODUCT_BUNDLE_TYPE) }) bundleType: 'FIXED_VIRTUAL';
  @ApiProperty({ enum: Object.values(PRODUCT_BUNDLE_STATUS) }) status: 'ACTIVE' | 'INACTIVE';
  @ApiProperty({ type: [BundleComponentDto] }) components: BundleComponentDto[];
}

export class ProductSummaryDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() productNo: string;
  @ApiProperty() name: string;
  @ApiProperty() slug: string;
  @ApiPropertyOptional() brand?: string;
  @ApiPropertyOptional() primaryCategory?: string;
  @ApiProperty({ enum: Object.values(PRODUCT_TYPE) }) productType: ProductType;
  @ApiProperty({ enum: Object.values(PRODUCT_STATUS) }) status: ProductStatus;
  @ApiProperty({ example: 0 }) version: number;
  @ApiPropertyOptional({ type: String, example: '18990000.00', nullable: true }) minPrice?: string | null;
  @ApiProperty({ enum: Object.values(PRODUCT_CURRENCY), example: 'VND' }) currency: 'VND';
  @ApiPropertyOptional({ type: String, format: 'uri', nullable: true }) imageUrl?: string | null;
}

export class ProductDetailDto extends ProductSummaryDto {
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true }) brandId?: string | null;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true }) primaryCategoryId?: string | null;
  @ApiPropertyOptional() shortDescription?: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty({ type: [ProductVariantDto] }) variants: ProductVariantDto[];
  @ApiProperty({ type: [ProductMediaDto] }) media: ProductMediaDto[];
  @ApiProperty({ type: [ProductCategoryDto] }) categories: ProductCategoryDto[];
  @ApiProperty({ type: [String], format: 'uuid' }) categoryIds: string[];
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
  @Type(() => Number) @IsInt() @Min(1) @IsOptional() page: number = 1;

  @ApiPropertyOptional({ default: 12, minimum: 1, maximum: 100 })
  @Type(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional() limit: number = 12;

  @ApiPropertyOptional() @IsString() @IsOptional() search?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() category?: string;
  @ApiPropertyOptional({ enum: Object.values(PRODUCT_STATUS) })
  @IsIn(Object.values(PRODUCT_STATUS)) @IsOptional() status?: ProductStatus;
}

export class CreateProductDto {
  @ApiPropertyOptional({ enum: Object.values(PRODUCT_TYPE), default: PRODUCT_TYPE.STANDARD })
  @IsIn(Object.values(PRODUCT_TYPE))
  @IsOptional()
  productType?: ProductType = PRODUCT_TYPE.STANDARD;

  @ApiProperty() @IsString() @Matches(/^[A-Z0-9-]+$/) @MaxLength(32) productNo: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255) name: string;
  @ApiProperty() @IsString() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) @MaxLength(255) slug: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsUUID() @IsOptional() brandId?: string;
  @ApiPropertyOptional() @IsString() @MaxLength(1000) @IsOptional() shortDescription?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() description?: string;
  @ApiProperty({ type: [String], format: 'uuid' }) @IsArray() @ArrayNotEmpty() @IsUUID('all', { each: true }) categoryIds: string[];
  @ApiProperty({ format: 'uuid' }) @IsUUID() primaryCategoryId: string;
}

export class UpdateProductFieldsDto extends PartialType(
  OmitType(CreateProductDto, ['brandId', 'shortDescription', 'description'] as const),
) {
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsUUID()
  @IsOptional()
  brandId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsString()
  @IsOptional()
  shortDescription?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsString()
  @IsOptional()
  description?: string | null;
}

export class UpdateProductDto extends UpdateProductFieldsDto {
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) expectedVersion: number;
}

export class CreateVariantDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(64) sku: string;
  @ApiPropertyOptional() @IsString() @MaxLength(64) @IsOptional() barcode?: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255) name: string;
  @ApiPropertyOptional({ default: 0 }) @IsInt() @Min(0) @IsOptional() weightGrams = 0;
  @ApiPropertyOptional() @IsInt() @Min(1) @IsOptional() lengthMm?: number;
  @ApiPropertyOptional() @IsInt() @Min(1) @IsOptional() widthMm?: number;
  @ApiPropertyOptional() @IsInt() @Min(1) @IsOptional() heightMm?: number;
}

export class UpdateVariantFieldsDto {
  @ApiPropertyOptional() @IsString() @IsNotEmpty() @MaxLength(255) @IsOptional() name?: string;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsString() @MaxLength(64) @IsOptional() barcode?: string | null;
  @ApiPropertyOptional({ minimum: 0 }) @IsInt() @Min(0) @IsOptional() weightGrams?: number;
  @ApiPropertyOptional({ type: Number, minimum: 1, nullable: true }) @IsInt() @Min(1) @IsOptional() lengthMm?: number | null;
  @ApiPropertyOptional({ type: Number, minimum: 1, nullable: true }) @IsInt() @Min(1) @IsOptional() widthMm?: number | null;
  @ApiPropertyOptional({ type: Number, minimum: 1, nullable: true }) @IsInt() @Min(1) @IsOptional() heightMm?: number | null;
}

export class UpdateVariantDto extends UpdateVariantFieldsDto {
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) expectedVersion: number;
}

export class AttachProductMediaDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() mediaAssetId: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsUUID() @IsOptional() variantId?: string;
  @ApiPropertyOptional({ maxLength: 500 }) @IsString() @MaxLength(500) @IsOptional() altText?: string;
  @ApiPropertyOptional({ type: Boolean, default: false }) @IsBoolean() @IsOptional() isPrimary = false;
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) expectedProductVersion: number;
}

export class UpdateProductMediaDto {
  @ApiPropertyOptional({ type: String, maxLength: 500, nullable: true })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  altText?: string | null;

  @ApiPropertyOptional({ type: Boolean }) @IsBoolean() @IsOptional() isPrimary?: boolean;
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) expectedProductVersion: number;
}

export class ReorderProductMediaItemDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() id: string;
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) sortOrder: number;
}

export class ReorderProductMediaDto {
  @ApiProperty({ type: [ReorderProductMediaItemDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ReorderProductMediaItemDto)
  items: ReorderProductMediaItemDto[];

  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) expectedProductVersion: number;
}

export class ChangeProductMediaStatusDto {
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) expectedProductVersion: number;
}

export class CreatePriceDto {
  @ApiProperty({ example: '18990000.00', description: 'VAT-included VND amount greater than zero' })
  @IsNumberString()
  @Matches(/^(?=.*[1-9])\d+(?:\.\d{1,2})?$/)
  amount: string;
  @ApiProperty({ format: 'date-time' }) @IsDateString() startsAt: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsDateString() @IsOptional() endsAt?: string;
  @ApiPropertyOptional({
    maxLength: 500,
    description: 'Business reason; mandatory when reducing the reference price by more than 20%',
  })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  reason?: string;
}

export class ReplacePriceDto extends CreatePriceDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() expectedCurrentPriceId: string;
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) expectedCurrentPriceVersion: number;
}

export class ProductPriceWindowDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: '18990000.00' }) amount: string;
  @ApiProperty({ format: 'date-time' }) startsAt: string;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) endsAt?: string | null;
  @ApiProperty() status: string;
  @ApiProperty({ minimum: 0 }) version: number;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}

export class ProductPriceTimelineDto {
  @ApiProperty({ format: 'uuid' }) productVariantId: string;
  @ApiPropertyOptional({ type: ProductPriceWindowDto, nullable: true })
  current?: ProductPriceWindowDto | null;
  @ApiProperty({ type: [ProductPriceWindowDto] }) upcoming: ProductPriceWindowDto[];
  @ApiProperty({ type: [ProductPriceWindowDto] }) history: ProductPriceWindowDto[];
}

export class ChangeProductStatusDto {
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) expectedVersion: number;
}

export class CreateBundleItemDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() componentVariantId: string;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) quantity: number;
}

export class CreateBundleDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() bundleVariantId: string;
  @ApiProperty({ type: [CreateBundleItemDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateBundleItemDto)
  items: CreateBundleItemDto[];
}
