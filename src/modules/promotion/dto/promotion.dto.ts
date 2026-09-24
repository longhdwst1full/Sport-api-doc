import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ENTITY_ID_OPENAPI, IsEntityId } from '../../../common/identifiers/entity-id';
import {
  FLASH_SALE_CAMPAIGN_STATUS,
  FLASH_SALE_ITEM_STATUS,
} from '../promotion.constants';

const trimOptional = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class FlashSaleItemDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) id: string;
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) productVariantId: string;
  @ApiProperty() sku: string;
  @ApiProperty() productName: string;
  @ApiProperty() productSlug: string;
  @ApiPropertyOptional({ type: String, format: 'uri', nullable: true }) imageUrl: string | null;
  @ApiProperty({ type: String, example: '1990000.00' }) salePrice: string;
  @ApiPropertyOptional({ type: String, example: '2490000.00', nullable: true, description: 'Giá thường tại thời điểm đọc; null khi chưa có bảng giá hiệu lực' })
  regularPrice: string | null;
  @ApiProperty() quota: number;
  @ApiProperty() soldQuantity: number;
  @ApiProperty({ description: 'Số suất còn bán được = quota - sold - reserved' }) availableQuantity: number;
  @ApiPropertyOptional({ type: Number, nullable: true }) perCustomerLimit: number | null;
  @ApiProperty({ enum: Object.values(FLASH_SALE_ITEM_STATUS), enumName: 'FlashSaleItemStatus' }) status: string;
  @ApiProperty() version: string;
}

export class FlashSaleCampaignSummaryDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) id: string;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional({ type: String, nullable: true }) description: string | null;
  @ApiProperty({ format: 'date-time' }) startsAt: string;
  @ApiProperty({ format: 'date-time' }) endsAt: string;
  @ApiProperty({ enum: Object.values(FLASH_SALE_CAMPAIGN_STATUS), enumName: 'FlashSaleCampaignStatus' }) status: string;
  @ApiProperty() itemCount: number;
  @ApiProperty() version: string;
}

export class FlashSaleCampaignDetailDto extends FlashSaleCampaignSummaryDto {
  @ApiProperty({ type: [FlashSaleItemDto] }) items: FlashSaleItemDto[];
}

export class FlashSaleCampaignListDto {
  @ApiProperty({ type: [FlashSaleCampaignSummaryDto] }) items: FlashSaleCampaignSummaryDto[];
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() total: number;
}

export class AdminFlashSaleQueryDto {
  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1 })
  @Type(() => Number) @IsInt() @Min(1) @IsOptional() page = 1;

  @ApiPropertyOptional({ type: Number, default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional() limit = 20;

  @ApiPropertyOptional({ enum: Object.values(FLASH_SALE_CAMPAIGN_STATUS), enumName: 'FlashSaleCampaignStatus' })
  @IsIn(Object.values(FLASH_SALE_CAMPAIGN_STATUS)) @IsOptional() status?: string;

  @ApiPropertyOptional({ maxLength: 100, description: 'Mã hoặc tên chiến dịch' })
  @Transform(trimOptional) @IsString() @MaxLength(100) @IsOptional() search?: string;
}

export class CreateFlashSaleCampaignDto {
  @ApiProperty({ pattern: '^[A-Z0-9-]+$', maxLength: 32 })
  @IsString() @Matches(/^[A-Z0-9-]+$/) @MaxLength(32) code: string;

  @ApiProperty({ maxLength: 255 })
  @Transform(trimOptional) @IsString() @IsNotEmpty() @MaxLength(255) name: string;

  @ApiPropertyOptional()
  @Transform(trimOptional) @IsString() @IsOptional() description?: string;

  @ApiProperty({ format: 'date-time' }) @IsISO8601() startsAt: string;
  @ApiProperty({ format: 'date-time' }) @IsISO8601() endsAt: string;
}

export class UpdateFlashSaleCampaignDto {
  @ApiProperty({ type: String, pattern: '^\\d+$' })
  @IsString() expectedVersion: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @Transform(trimOptional) @IsString() @IsNotEmpty() @MaxLength(255) @IsOptional() name?: string;

  @ApiPropertyOptional()
  @Transform(trimOptional) @IsString() @IsOptional() description?: string;

  @ApiPropertyOptional({ format: 'date-time' }) @IsISO8601() @IsOptional() startsAt?: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsISO8601() @IsOptional() endsAt?: string;
}

export class ChangeFlashSaleCampaignStatusDto {
  @ApiProperty({ type: String, pattern: '^\\d+$' })
  @IsString() expectedVersion: string;

  @ApiProperty({ enum: Object.values(FLASH_SALE_CAMPAIGN_STATUS), enumName: 'FlashSaleCampaignStatus' })
  @IsIn(Object.values(FLASH_SALE_CAMPAIGN_STATUS)) status: string;
}

export class UpsertFlashSaleItemDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) @IsEntityId() productVariantId: string;

  @ApiProperty({ type: String, example: '1990000.00', description: 'Decimal dạng chuỗi; không gửi number để tránh sai số' })
  @IsString() @Matches(/^\d{1,17}(\.\d{1,2})?$/) salePrice: string;

  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) quota: number;

  @ApiPropertyOptional({ minimum: 1, nullable: true })
  @IsInt() @Min(1) @IsOptional() perCustomerLimit?: number;
}

export class RemoveFlashSaleItemDto {
  @ApiProperty({ type: String, pattern: '^\\d+$' })
  @IsString() expectedVersion: string;
}

export class PublicFlashSaleCampaignDto {
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional({ type: String, nullable: true }) description: string | null;
  @ApiProperty({ format: 'date-time' }) startsAt: string;
  @ApiProperty({ format: 'date-time', description: 'Mốc kết thúc để client đếm ngược; server vẫn là nguồn quyết định' })
  endsAt: string;
  @ApiProperty({ type: [FlashSaleItemDto] }) items: FlashSaleItemDto[];
}

export class PublicFlashSaleListDto {
  @ApiProperty({ type: [PublicFlashSaleCampaignDto] }) items: PublicFlashSaleCampaignDto[];
  @ApiProperty({ format: 'date-time', description: 'Thời điểm server trả dữ liệu; client dùng để hiệu chỉnh đồng hồ đếm ngược' })
  serverTime: string;
}
