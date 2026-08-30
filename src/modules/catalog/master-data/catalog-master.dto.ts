import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class BrandDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty() slug: string;
  @ApiPropertyOptional() description?: string;
  @ApiPropertyOptional({ format: 'uuid' }) logoAssetId?: string;
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] }) status: 'ACTIVE' | 'INACTIVE';
  @ApiProperty() version: number;
}

export class BrandListDto {
  @ApiProperty({ type: [BrandDto] }) items: BrandDto[];
  @ApiProperty() total: number;
}

export class CategoryDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiPropertyOptional({ format: 'uuid' }) parentId?: string;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty() slug: string;
  @ApiProperty() path: string;
  @ApiProperty() depth: number;
  @ApiPropertyOptional() description?: string;
  @ApiPropertyOptional({ format: 'uuid' }) imageAssetId?: string;
  @ApiProperty() sortOrder: number;
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] }) status: 'ACTIVE' | 'INACTIVE';
  @ApiProperty() version: number;
}

export class CategoryListDto {
  @ApiProperty({ type: [CategoryDto] }) items: CategoryDto[];
  @ApiProperty() total: number;
}

export class CreateBrandDto {
  @ApiProperty() @IsString() @Matches(/^[A-Z0-9-]+$/) @MaxLength(32) code: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255) name: string;
  @ApiProperty() @IsString() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) @MaxLength(255) slug: string;
  @ApiPropertyOptional() @IsString() @IsOptional() description?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsUUID() @IsOptional() logoAssetId?: string;
}

export class CreateCategoryDto {
  @ApiPropertyOptional({ format: 'uuid' }) @IsUUID() @IsOptional() parentId?: string;
  @ApiProperty() @IsString() @Matches(/^[A-Z0-9-]+$/) @MaxLength(32) code: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255) name: string;
  @ApiProperty() @IsString() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) @MaxLength(255) slug: string;
  @ApiPropertyOptional() @IsString() @IsOptional() description?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsUUID() @IsOptional() imageAssetId?: string;
  @ApiPropertyOptional({ minimum: 0, default: 0 }) @IsInt() @Min(0) @IsOptional() sortOrder?: number;
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
  @ApiPropertyOptional({ format: 'uuid' }) @IsUUID() @IsOptional() logoAssetId?: string;
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
  @ApiPropertyOptional({ format: 'uuid' }) @IsUUID() @IsOptional() imageAssetId?: string;
  @ApiPropertyOptional({ minimum: 0 }) @IsInt() @Min(0) @IsOptional() sortOrder?: number;
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) expectedVersion: number;
}

export class ChangeMasterStatusDto {
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) expectedVersion: number;
}
