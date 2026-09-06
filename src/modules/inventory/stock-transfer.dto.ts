import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ENTITY_ID_OPENAPI } from '../../common/identifiers/entity-id';
import { STOCK_TRANSFER_STATUS, type StockTransferStatus } from './stock-transfer.constants';

const trimOptional = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

export class CreateStockTransferItemDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(64) sku: string;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) requestedQuantity: number;
}

export class CreateStockTransferDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(32) fromWarehouseCode: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(32) toWarehouseCode: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MinLength(3) @MaxLength(1000) reason: string;
  @ApiProperty({ type: [CreateStockTransferItemDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateStockTransferItemDto)
  items: CreateStockTransferItemDto[];
}

export class StockTransferTransitionDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI, description: 'Current optimistic-lock version' })
  @IsString()
  @IsNotEmpty()
  version: string;
}

export class ReceiveStockTransferItemDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(64) sku: string;
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) receivedQuantity: number;
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) damagedQuantity: number;
  @ApiPropertyOptional({ maxLength: 500 })
  @Transform(trimOptional)
  @IsString()
  @MaxLength(500)
  @IsOptional()
  damageReason?: string;
}

export class ReceiveStockTransferDto extends StockTransferTransitionDto {
  @ApiProperty({ type: [ReceiveStockTransferItemDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ReceiveStockTransferItemDto)
  items: ReceiveStockTransferItemDto[];
}

export class StockTransferQueryDto {
  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1 })
  @Type(() => Number) @IsInt() @Min(1) @IsOptional() page = 1;
  @ApiPropertyOptional({ type: Number, default: 25, minimum: 1, maximum: 100 })
  @Type(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional() limit = 25;
  @ApiPropertyOptional({ maxLength: 100 })
  @Transform(trimOptional) @IsString() @MaxLength(100) @IsOptional() search?: string;
  @ApiPropertyOptional({ maxLength: 32 })
  @Transform(trimOptional) @IsString() @MaxLength(32) @IsOptional() warehouseCode?: string;
  @ApiPropertyOptional({ enum: Object.values(STOCK_TRANSFER_STATUS) })
  @IsIn(Object.values(STOCK_TRANSFER_STATUS)) @IsOptional() status?: StockTransferStatus;
}

export class StockTransferItemDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) id: string;
  @ApiProperty() sku: string;
  @ApiProperty() productName: string;
  @ApiProperty() requestedQuantity: number;
  @ApiProperty() shippedQuantity: number;
  @ApiProperty() receivedQuantity: number;
  @ApiProperty() damagedQuantity: number;
  @ApiPropertyOptional({ type: String, nullable: true }) damageReason?: string | null;
}

export class StockTransferSummaryDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) id: string;
  @ApiProperty() transferNo: string;
  @ApiProperty() fromWarehouseCode: string;
  @ApiProperty() toWarehouseCode: string;
  @ApiProperty({ enum: Object.values(STOCK_TRANSFER_STATUS) }) status: StockTransferStatus;
  @ApiProperty() reason: string;
  @ApiProperty() itemCount: number;
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) version: string;
  @ApiProperty() createdByDisplayName: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) submittedAt?: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) shippedAt?: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) receivedAt?: string | null;
}

export class StockTransferDetailDto extends StockTransferSummaryDto {
  @ApiProperty({ type: [StockTransferItemDto] }) items: StockTransferItemDto[];
  @ApiPropertyOptional({ type: String, nullable: true }) shippedByDisplayName?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) receivedByDisplayName?: string | null;
}

export class StockTransferListDto {
  @ApiProperty({ type: [StockTransferSummaryDto] }) items: StockTransferSummaryDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}
