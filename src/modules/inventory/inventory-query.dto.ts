import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ENTITY_ID_OPENAPI } from '../../common/identifiers/entity-id';
import { INVENTORY_MOVEMENT_TYPE } from './inventory.constants';

const trimOptional = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

export class InventoryBalanceQueryDto {
  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page = 1;

  @ApiPropertyOptional({ type: Number, default: 25, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit = 25;

  @ApiPropertyOptional({ maxLength: 100, description: 'Search SKU or product name' })
  @Transform(trimOptional)
  @IsString()
  @MaxLength(100)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ maxLength: 32 })
  @Transform(trimOptional)
  @IsString()
  @MaxLength(32)
  @IsOptional()
  warehouseCode?: string;
}

export class InventoryMovementQueryDto {
  @ApiPropertyOptional({ type: Number, default: 25, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit = 25;

  @ApiPropertyOptional({ description: 'Opaque cursor returned by the previous response' })
  @IsString()
  @IsOptional()
  cursor?: string;

  @ApiPropertyOptional({ maxLength: 32 })
  @Transform(trimOptional)
  @IsString()
  @MaxLength(32)
  @IsOptional()
  warehouseCode?: string;

  @ApiPropertyOptional({ maxLength: 64 })
  @Transform(trimOptional)
  @IsString()
  @MaxLength(64)
  @IsOptional()
  sku?: string;

  @ApiPropertyOptional({ enum: Object.values(INVENTORY_MOVEMENT_TYPE) })
  @IsIn(Object.values(INVENTORY_MOVEMENT_TYPE))
  @IsOptional()
  movementType?: string;

  @ApiPropertyOptional({ maxLength: 64 })
  @Transform(trimOptional)
  @IsString()
  @MaxLength(64)
  @IsOptional()
  referenceType?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @Transform(trimOptional)
  @IsString()
  @MaxLength(100)
  @IsOptional()
  referenceId?: string;

  @ApiPropertyOptional({ format: 'date-time' }) @IsDateString() @IsOptional() from?: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsDateString() @IsOptional() to?: string;
}

export class InventoryMovementDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) id: string;
  @ApiProperty() warehouseCode: string;
  @ApiProperty() sku: string;
  @ApiProperty() productName: string;
  @ApiProperty({ enum: Object.values(INVENTORY_MOVEMENT_TYPE) }) movementType: string;
  @ApiProperty() quantityDelta: number;
  @ApiProperty() balanceAfter: number;
  @ApiProperty() referenceType: string;
  @ApiProperty() referenceId: string;
  @ApiProperty() reason: string;
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) createdBy: string;
  @ApiProperty() createdByDisplayName: string;
  @ApiProperty({ format: 'date-time' }) occurredAt: string;
}

export class InventoryMovementListDto {
  @ApiProperty({ type: [InventoryMovementDto] }) items: InventoryMovementDto[];
  @ApiPropertyOptional({ type: String, nullable: true }) nextCursor?: string | null;
}

export class StockAdjustmentSummaryDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) id: string;
  @ApiProperty() adjustmentNo: string;
  @ApiProperty() warehouseCode: string;
  @ApiProperty() adjustmentType: string;
  @ApiProperty() reasonCode: string;
  @ApiPropertyOptional({ type: String, nullable: true }) externalReference?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) sourceName?: string | null;
  @ApiProperty() reason: string;
  @ApiProperty() status: string;
  @ApiProperty() itemCount: number;
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) createdBy: string;
  @ApiProperty() createdByDisplayName: string;
  @ApiProperty({ format: 'date-time' }) postedAt: string;
}

export class StockAdjustmentListDto {
  @ApiProperty({ type: [StockAdjustmentSummaryDto] }) items: StockAdjustmentSummaryDto[];
  @ApiPropertyOptional({ type: String, nullable: true }) nextCursor?: string | null;
}

export class StockAdjustmentItemDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) id: string;
  @ApiProperty() sku: string;
  @ApiProperty() productName: string;
  @ApiProperty() quantityDelta: number;
  @ApiProperty() expectedOnHand: number;
  @ApiProperty() actualOnHand: number;
  @ApiPropertyOptional({ nullable: true }) note?: string | null;
}

export class StockAdjustmentDetailDto extends StockAdjustmentSummaryDto {
  @ApiProperty({ type: [StockAdjustmentItemDto] }) items: StockAdjustmentItemDto[];
}

export class StockAdjustmentQueryDto {
  @ApiPropertyOptional({ type: Number, default: 25, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit = 25;

  @ApiPropertyOptional({ description: 'Opaque cursor returned by the previous response' })
  @IsString()
  @IsOptional()
  cursor?: string;

  @ApiPropertyOptional({ maxLength: 32 })
  @Transform(trimOptional)
  @IsString()
  @MaxLength(32)
  @IsOptional()
  warehouseCode?: string;

  @ApiPropertyOptional({ format: 'date-time' }) @IsDateString() @IsOptional() from?: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsDateString() @IsOptional() to?: string;
}
