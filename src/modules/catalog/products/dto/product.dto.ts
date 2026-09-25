import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ENTITY_ID_OPENAPI, IsEntityId } from '../../../../common/identifiers/entity-id';
import {
  PRODUCT_BUNDLE_STATUS,
  PRODUCT_BUNDLE_TYPE,
  PRODUCT_CURRENCY,
  PRODUCT_IDENTIFIER,
  PRODUCT_LIST_SORT,
  PRODUCT_MEDIA_STATUS,
  PRODUCT_STATUS,
  PRODUCT_TYPE,
  PRODUCT_VARIANT_STATUS,
  ProductListSort,
  ProductStatus,
  ProductMediaStatus,
  ProductType,
  ProductVariantStatus,
} from '../product.constants';
import { normalizeSku } from '../product-identifiers';
import { ProductSpecificationDto } from '../../attributes/attribute.dto';
import { PRODUCT_READINESS_ISSUE, type ProductReadinessIssueCode } from '../product-publish.policy';

export class ProductVariantDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) id: string;
  @ApiProperty() sku: string;
  @ApiPropertyOptional() barcode?: string;
  @ApiProperty() name: string;
  @ApiProperty({ minimum: 0 }) weightGrams: number;
  @ApiPropertyOptional({ type: Number, minimum: 1, nullable: true }) lengthMm?: number | null;
  @ApiPropertyOptional({ type: Number, minimum: 1, nullable: true }) widthMm?: number | null;
  @ApiPropertyOptional({ type: Number, minimum: 1, nullable: true }) heightMm?: number | null;
  @ApiProperty({ enum: Object.values(PRODUCT_VARIANT_STATUS), enumName: 'ProductVariantStatus' }) status: ProductVariantStatus;
  @ApiProperty({ example: 0 }) version: number;
  @ApiPropertyOptional({ type: String, example: '18990000.00', nullable: true }) effectivePrice?: string | null;
  @ApiPropertyOptional({ ...ENTITY_ID_OPENAPI, nullable: true }) effectivePriceId?: string | null;
  @ApiPropertyOptional({ type: Number, example: 0, nullable: true }) effectivePriceVersion?: number | null;
  @ApiPropertyOptional({ type: () => ProductBundleDto, nullable: true }) bundle?: ProductBundleDto | null;
  @ApiPropertyOptional({
    type: Boolean,
    description:
      'Còn hàng ở ít nhất một kho chi nhánh đang hoạt động (tồn thực − đang giữ ≥ 1; combo tính theo thành phần thiếu nhất). ' +
      'Chỉ có ở getCatalogProduct/getAdminProduct; response của lệnh ghi không tính.',
  })
  inStock?: boolean;
}

export class ProductMediaDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) id: string;
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) mediaAssetId: string;
  @ApiPropertyOptional({ ...ENTITY_ID_OPENAPI, nullable: true }) variantId?: string | null;
  @ApiProperty({ format: 'uri' }) secureUrl: string;
  @ApiPropertyOptional({ type: String, format: 'uri', nullable: true }) thumbnailUrl?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) altText?: string | null;
  @ApiProperty({ minimum: 0 }) sortOrder: number;
  @ApiProperty() isPrimary: boolean;
  @ApiProperty({ enum: Object.values(PRODUCT_MEDIA_STATUS), enumName: 'ProductMediaStatus' }) status: ProductMediaStatus;
}

export class ProductCategoryDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) id: string;
  @ApiProperty() name: string;
  @ApiProperty() isPrimary: boolean;
}

export class BundleComponentDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) componentVariantId: string;
  @ApiProperty() componentSku: string;
  @ApiProperty() componentName: string;
  @ApiProperty({ minimum: 1 }) quantity: number;
}

export class ProductBundleDto {
  @ApiProperty({ enum: Object.values(PRODUCT_BUNDLE_TYPE), enumName: 'ProductBundleType' }) bundleType: 'FIXED_VIRTUAL';
  @ApiProperty({ enum: Object.values(PRODUCT_BUNDLE_STATUS), enumName: 'ProductBundleStatus' }) status: 'ACTIVE' | 'INACTIVE';
  @ApiProperty({ type: [BundleComponentDto] }) components: BundleComponentDto[];
}

export class ProductSummaryDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) id: string;
  @ApiPropertyOptional({
    ...ENTITY_ID_OPENAPI,
    nullable: true,
    description: 'Sellable variant represented by minPrice; use this ID for quick-add cart actions',
  })
  defaultVariantId?: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Immutable SKU of defaultVariantId',
  })
  defaultVariantSku?: string | null;
  @ApiProperty() productNo: string;
  @ApiProperty() name: string;
  @ApiProperty() slug: string;
  @ApiPropertyOptional() brand?: string;
  @ApiPropertyOptional() primaryCategory?: string;
  @ApiProperty({ enum: Object.values(PRODUCT_TYPE), enumName: 'ProductType' }) productType: ProductType;
  @ApiProperty({ enum: Object.values(PRODUCT_STATUS), enumName: 'ProductStatus' }) status: ProductStatus;

  @ApiProperty({
    example: true,
    description:
      'Có hiển thị trên website hay không. Tách khỏi status để ẩn tạm một sản phẩm đang bán mà không phải đẩy về DRAFT.',
  })
  isPublished: boolean;

  @ApiProperty({ example: 0 }) version: number;
  @ApiPropertyOptional({ type: String, example: '18990000.00', nullable: true }) minPrice?: string | null;
  @ApiProperty({ enum: Object.values(PRODUCT_CURRENCY), enumName: 'CurrencyCode', example: 'VND' }) currency: 'VND';
  @ApiPropertyOptional({ type: String, format: 'uri', nullable: true }) imageUrl?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Mô tả ngắn cho thẻ sản phẩm' })
  shortDescription?: string | null;
  @ApiPropertyOptional({
    type: Boolean,
    description:
      'Có ít nhất một SKU đang bán còn hàng ở một kho chi nhánh đang hoạt động. Có trong mọi response danh sách và chi tiết; ' +
      'response của lệnh ghi không tính. Không lộ số lượng tồn.',
  })
  inStock?: boolean;
}

export class ProductDetailDto extends ProductSummaryDto {
  @ApiProperty({
    type: [ProductSpecificationDto],
    description: 'Thông số kỹ thuật đã ghép nhãn/đơn vị từ từ điển thuộc tính; rỗng nếu chưa nhập',
  })
  specifications: ProductSpecificationDto[];
  @ApiPropertyOptional({ ...ENTITY_ID_OPENAPI, nullable: true }) brandId?: string | null;
  @ApiPropertyOptional({ ...ENTITY_ID_OPENAPI, nullable: true }) primaryCategoryId?: string | null;
  @ApiPropertyOptional() description?: string;
  @ApiProperty({ type: [ProductVariantDto] }) variants: ProductVariantDto[];
  @ApiProperty({ type: [ProductMediaDto] }) media: ProductMediaDto[];
  @ApiProperty({ type: [ProductCategoryDto] }) categories: ProductCategoryDto[];
  @ApiProperty({ ...ENTITY_ID_OPENAPI, type: [String], example: ['1'] }) categoryIds: string[];
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

  @ApiPropertyOptional({ description: 'Tìm gộp theo tên, mã sản phẩm hoặc SKU. Giữ cho tương thích ngược.' })
  @IsString() @IsOptional() search?: string;

  @ApiPropertyOptional({ description: 'Chỉ lọc theo tên sản phẩm' })
  @IsString() @IsOptional() name?: string;

  @ApiPropertyOptional({ description: 'Chỉ lọc theo mã sản phẩm' })
  @IsString() @IsOptional() productNo?: string;

  @ApiPropertyOptional({ description: 'Chỉ lọc theo SKU của biến thể' })
  @IsString() @IsOptional() sku?: string;

  @ApiPropertyOptional({ description: 'Slug danh mục; gồm cả nhánh con' })
  @IsString() @IsOptional() category?: string;
  @ApiPropertyOptional({ enum: Object.values(PRODUCT_STATUS), enumName: 'ProductStatus' })
  @IsIn(Object.values(PRODUCT_STATUS)) @IsOptional() status?: ProductStatus;

  @ApiPropertyOptional({
    enum: Object.values(PRODUCT_LIST_SORT),
    enumName: 'ProductListSort',
    default: PRODUCT_LIST_SORT.NEWEST,
    description: 'Giá so theo minPrice; sản phẩm chưa có giá luôn xếp cuối',
  })
  @IsIn(Object.values(PRODUCT_LIST_SORT)) @IsOptional() sort?: ProductListSort;

  @ApiPropertyOptional({ type: String, pattern: '^\\d+(\\.\\d{1,2})?$', example: '1000000', description: 'minPrice ≥ giá trị này (VND)' })
  @Matches(/^\d+(\.\d{1,2})?$/) @IsOptional() minPrice?: string;

  @ApiPropertyOptional({ type: String, pattern: '^\\d+(\\.\\d{1,2})?$', example: '5000000', description: 'minPrice ≤ giá trị này (VND)' })
  @Matches(/^\d+(\.\d{1,2})?$/) @IsOptional() maxPrice?: string;
}

export class CreateProductDto {
  @ApiPropertyOptional({ enum: Object.values(PRODUCT_TYPE), enumName: 'ProductType', default: PRODUCT_TYPE.STANDARD })
  @IsIn(Object.values(PRODUCT_TYPE))
  @IsOptional()
  productType?: ProductType = PRODUCT_TYPE.STANDARD;

  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255) name: string;
  @ApiPropertyOptional({ ...ENTITY_ID_OPENAPI }) @IsEntityId() @IsOptional() brandId?: string;
  @ApiPropertyOptional() @IsString() @MaxLength(1000) @IsOptional() shortDescription?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() description?: string;
  @ApiProperty({ ...ENTITY_ID_OPENAPI, type: [String], example: ['1'] }) @IsArray() @ArrayNotEmpty() @IsEntityId({ each: true }) categoryIds: string[];
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) @IsEntityId() primaryCategoryId: string;

  @ApiProperty({
    type: () => [CreateProductVariantDto],
    minItems: 1,
    maxItems: 50,
    description: 'Danh sách SKU ban đầu được tạo atomic cùng sản phẩm',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateProductVariantDto)
  variants: CreateProductVariantDto[];

  @ApiPropertyOptional({
    type: () => [CreateProductMediaDto],
    maxItems: 20,
    description: 'Ảnh cấp sản phẩm (asset đã upload và ACTIVE) gắn cùng transaction; ảnh đầu tiên là ảnh chính',
  })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CreateProductMediaDto)
  @IsOptional()
  media?: CreateProductMediaDto[];
}

export class UpdateProductFieldsDto extends PartialType(
  OmitType(CreateProductDto, ['brandId', 'shortDescription', 'description', 'variants', 'media'] as const),
) {
  @ApiPropertyOptional({ description: 'Only mutable while the product is DRAFT' })
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(255)
  @IsOptional()
  slug?: string;

  @ApiPropertyOptional({ ...ENTITY_ID_OPENAPI, nullable: true })
  @IsEntityId()
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

  @ApiPropertyOptional({
    description: 'Bật/tắt hiển thị trên website. Không đổi status của sản phẩm.',
  })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class CreateVariantDto {
  @ApiPropertyOptional({
    example: 'TD-02',
    maxLength: 40,
    description: 'Mã hàng của cửa hàng; tự viết hoa. Bỏ trống thì backend sinh mã 8 ký tự. Không sửa được sau khi tạo.',
  })
  @Transform(({ value }) => normalizeSku(value))
  @IsString()
  @Matches(PRODUCT_IDENTIFIER.SKU_PATTERN, { message: 'SKU chỉ gồm A-Z, 0-9, . _ + - và dài 2-40 ký tự' })
  @IsOptional()
  sku?: string;
  @ApiPropertyOptional() @IsString() @MaxLength(64) @IsOptional() barcode?: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255) name: string;
  @ApiPropertyOptional({ default: 0 }) @IsInt() @Min(0) @IsOptional() weightGrams?: number = 0;
  @ApiPropertyOptional() @IsInt() @Min(1) @IsOptional() lengthMm?: number;
  @ApiPropertyOptional() @IsInt() @Min(1) @IsOptional() widthMm?: number;
  @ApiPropertyOptional() @IsInt() @Min(1) @IsOptional() heightMm?: number;
}

/** SKU ban đầu khi tạo sản phẩm: như CreateVariantDto, cộng giá bán ban đầu tuỳ chọn. */
export class CreateProductVariantDto extends CreateVariantDto {
  @ApiPropertyOptional({
    example: '7800000',
    description: 'Giá bán ban đầu (VND, đã gồm VAT) có hiệu lực ngay; cần quyền catalog.price.manage',
  })
  @IsNumberString()
  @Matches(/^(?=.*[1-9])\d+(?:\.\d{1,2})?$/)
  @IsOptional()
  initialPriceAmount?: string;
}

export class CreateProductMediaDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) @IsEntityId() mediaAssetId: string;
  @ApiPropertyOptional({ maxLength: 500 }) @IsString() @MaxLength(500) @IsOptional() altText?: string;
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
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) @IsEntityId() mediaAssetId: string;
  @ApiPropertyOptional({ ...ENTITY_ID_OPENAPI }) @IsEntityId() @IsOptional() variantId?: string;
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
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) @IsEntityId() id: string;
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
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) @IsEntityId() expectedCurrentPriceId: string;
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) expectedCurrentPriceVersion: number;
}

export class ProductPriceWindowDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) id: string;
  @ApiProperty({ example: '18990000.00' }) amount: string;
  @ApiProperty({ format: 'date-time' }) startsAt: string;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) endsAt?: string | null;
  @ApiProperty() status: string;
  @ApiProperty({ minimum: 0 }) version: number;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}

export class ProductPriceTimelineDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) productVariantId: string;
  @ApiPropertyOptional({ type: ProductPriceWindowDto, nullable: true })
  current?: ProductPriceWindowDto | null;
  @ApiProperty({ type: [ProductPriceWindowDto] }) upcoming: ProductPriceWindowDto[];
  @ApiProperty({ type: [ProductPriceWindowDto] }) history: ProductPriceWindowDto[];
}

export class ChangeProductStatusDto {
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) expectedVersion: number;
}

export class CreateBundleItemDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) @IsEntityId() componentVariantId: string;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) quantity: number;
}

export class CreateBundleDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) @IsEntityId() bundleVariantId: string;
  @ApiProperty({ type: [CreateBundleItemDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateBundleItemDto)
  items: CreateBundleItemDto[];
}

export class ProductReadinessIssueDto {
  @ApiProperty({ enum: Object.values(PRODUCT_READINESS_ISSUE), enumName: 'ProductReadinessIssueCode' })
  code: ProductReadinessIssueCode;
  @ApiProperty({ description: 'Câu mô tả ổn định (tiếng Anh); UI hiển thị theo `code`' }) message: string;
}

/** Checklist xuất bản; cùng policy với publishAdminProduct. */
export class ProductSetupStatusDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) productId: string;
  @ApiProperty({ enum: Object.values(PRODUCT_STATUS), enumName: 'ProductStatus' }) status: ProductStatus;
  @ApiProperty({ description: 'DRAFT và không còn điều kiện chặn' }) canPublish: boolean;
  @ApiProperty({ type: [ProductReadinessIssueDto], description: 'Điều kiện chặn xuất bản' })
  blockingIssues: ProductReadinessIssueDto[];
  @ApiProperty({ type: [ProductReadinessIssueDto], description: 'Chỉ cảnh báo, không chặn (ví dụ chưa có tồn)' })
  warnings: ProductReadinessIssueDto[];
}
