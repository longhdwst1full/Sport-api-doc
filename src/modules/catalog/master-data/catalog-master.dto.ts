import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { ENTITY_ID_OPENAPI, IsEntityId } from '../../../common/identifiers/entity-id';

export class BrandDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) id: string;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty() slug: string;
  @ApiPropertyOptional() description?: string;
  @ApiPropertyOptional({ ...ENTITY_ID_OPENAPI }) logoAssetId?: string;
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] }) status: 'ACTIVE' | 'INACTIVE';
  @ApiProperty() version: number;
}

export class BrandListDto {
  @ApiProperty({ type: [BrandDto] }) items: BrandDto[];
  @ApiProperty() total: number;
}

export class CategoryDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) id: string;
  @ApiPropertyOptional({ ...ENTITY_ID_OPENAPI }) parentId?: string;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty() slug: string;
  @ApiProperty() path: string;
  @ApiProperty() depth: number;
  @ApiPropertyOptional() description?: string;
  @ApiPropertyOptional({ ...ENTITY_ID_OPENAPI }) imageAssetId?: string;
  @ApiProperty() sortOrder: number;
  @ApiProperty({ description: 'Tắt thì sản phẩm thuộc danh mục không tạo được yêu cầu trả hàng (D54)' })
  returnable: boolean;
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] }) status: 'ACTIVE' | 'INACTIVE';
  @ApiProperty() version: number;
}

export class CategoryListDto {
  @ApiProperty({ type: [CategoryDto] }) items: CategoryDto[];
  @ApiProperty() total: number;
}

/**
 * Category công khai cho Storefront. Không lộ `id`/`version`/`path` nội bộ —
 * điều hướng ngoài cửa hàng đi bằng `slug`.
 */
export class CatalogCategoryDto {
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty() slug: string;
  @ApiPropertyOptional() description?: string;
  @ApiPropertyOptional({ type: String, format: 'uri', nullable: true }) imageUrl?: string | null;
  @ApiProperty() sortOrder: number;
  @ApiProperty({ description: 'Số sản phẩm PUBLISHED thuộc danh mục' }) productCount: number;

  @ApiProperty({ description: 'Độ sâu trong cây danh mục; 0 là danh mục gốc' })
  depth: number;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Slug danh mục cha; null nếu là danh mục gốc. Dùng để dựng menu nhiều cấp.',
  })
  parentSlug?: string | null;
}

export class CatalogCategoryListDto {
  @ApiProperty({ type: [CatalogCategoryDto] }) items: CatalogCategoryDto[];
  @ApiProperty() total: number;
}

export class CreateBrandDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255) name: string;

  @ApiPropertyOptional({
    description: 'Bỏ trống để Backend suy từ tên. Chỉ gửi khi cần giữ mã của hệ thống cũ.',
  })
  @IsString() @Matches(/^[A-Z0-9-]+$/) @MaxLength(32) @IsOptional()
  code?: string;

  @ApiPropertyOptional({
    description: 'Bỏ trống để Backend suy từ tên và tự thêm hậu tố khi trùng.',
  })
  @IsString() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) @MaxLength(255) @IsOptional()
  slug?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() description?: string;
  @ApiPropertyOptional({ ...ENTITY_ID_OPENAPI }) @IsEntityId() @IsOptional() logoAssetId?: string;
}

export class CreateCategoryDto {
  @ApiPropertyOptional({ ...ENTITY_ID_OPENAPI }) @IsEntityId() @IsOptional() parentId?: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255) name: string;

  @ApiPropertyOptional({
    description: 'Bỏ trống để Backend suy từ tên. Chỉ gửi khi cần giữ mã của hệ thống cũ.',
  })
  @IsString() @Matches(/^[A-Z0-9-]+$/) @MaxLength(32) @IsOptional()
  code?: string;

  @ApiPropertyOptional({
    description: 'Bỏ trống để Backend suy từ tên và tự thêm hậu tố khi trùng.',
  })
  @IsString() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) @MaxLength(255) @IsOptional()
  slug?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() description?: string;
  @ApiPropertyOptional({ ...ENTITY_ID_OPENAPI }) @IsEntityId() @IsOptional() imageAssetId?: string;
  @ApiPropertyOptional({ minimum: 0, default: 0 }) @IsInt() @Min(0) @IsOptional() sortOrder?: number;
  @ApiPropertyOptional({ default: true, description: 'Cho phép trả hàng sản phẩm thuộc danh mục (D54)' })
  @IsBoolean() @IsOptional() returnable?: boolean;
}

export class UpdateBrandDto {
  @ApiPropertyOptional() @IsString() @IsNotEmpty() @MaxLength(255) @IsOptional() name?: string;
  @ApiPropertyOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(255)
  @IsOptional()
  slug?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() description?: string;
  @ApiPropertyOptional({ ...ENTITY_ID_OPENAPI }) @IsEntityId() @IsOptional() logoAssetId?: string;
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) expectedVersion: number;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional() @IsString() @IsNotEmpty() @MaxLength(255) @IsOptional() name?: string;
  @ApiPropertyOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(255)
  @IsOptional()
  slug?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() description?: string;
  @ApiPropertyOptional({ ...ENTITY_ID_OPENAPI }) @IsEntityId() @IsOptional() imageAssetId?: string;
  @ApiPropertyOptional({ minimum: 0 }) @IsInt() @Min(0) @IsOptional() sortOrder?: number;
  @ApiPropertyOptional({ description: 'Cho phép trả hàng sản phẩm thuộc danh mục (D54)' })
  @IsBoolean() @IsOptional() returnable?: boolean;
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) expectedVersion: number;
}

export class ChangeMasterStatusDto {
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) expectedVersion: number;
}
