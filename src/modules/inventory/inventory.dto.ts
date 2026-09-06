import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  NotEquals,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  STOCK_ADJUSTMENT_REASON,
  STOCK_ADJUSTMENT_TYPE,
  type StockAdjustmentReason,
  type StockAdjustmentType,
} from './inventory.constants';

const trimOptional = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

export class InventoryBalanceDto {
  @ApiProperty() id: string;
  @ApiProperty() warehouseCode: string;
  @ApiProperty() sku: string;
  @ApiProperty() productName: string;
  @ApiProperty() onHand: number;
  @ApiProperty() reserved: number;
  @ApiProperty() available: number;
  @ApiProperty() reorderPoint: number;
  @ApiProperty({ enum: ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'] })
  status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
}

export class InventoryBalanceListDto {
  @ApiProperty({ type: [InventoryBalanceDto] }) items: InventoryBalanceDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}

export class StockAdjustmentItemInputDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(64) sku: string;
  @ApiProperty({ example: 5 }) @IsInt() @NotEquals(0) quantityDelta: number;
}

export class CreateStockAdjustmentDto {
  @ApiProperty({ example: 'KHO-HCM-01' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  warehouseCode: string;

  @ApiPropertyOptional({
    enum: Object.values(STOCK_ADJUSTMENT_TYPE),
    default: STOCK_ADJUSTMENT_TYPE.CORRECTION,
  })
  @IsIn(Object.values(STOCK_ADJUSTMENT_TYPE))
  @IsOptional()
  adjustmentType?: StockAdjustmentType;

  @ApiPropertyOptional({
    enum: Object.values(STOCK_ADJUSTMENT_REASON),
    default: STOCK_ADJUSTMENT_REASON.MANUAL,
  })
  @Transform(trimOptional)
  @IsIn(Object.values(STOCK_ADJUSTMENT_REASON))
  @MaxLength(64)
  @IsOptional()
  reasonCode?: StockAdjustmentReason;

  @ApiPropertyOptional({
    maxLength: 100,
    description: 'Required for MANUAL_RECEIPT; external receipt or delivery-note number',
  })
  @Transform(trimOptional)
  @IsString()
  @MaxLength(100)
  @IsOptional()
  externalReference?: string;

  @ApiPropertyOptional({ maxLength: 255, description: 'Supplier or external source label' })
  @Transform(trimOptional)
  @IsString()
  @MaxLength(255)
  @IsOptional()
  sourceName?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(1000)
  reason: string;
  @ApiProperty({ type: [StockAdjustmentItemInputDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => StockAdjustmentItemInputDto)
  items: StockAdjustmentItemInputDto[];
}

export class StockAdjustmentResultDto {
  @ApiProperty() adjustmentNo: string;
  @ApiProperty({ enum: ['POSTED'] }) status: 'POSTED';
  @ApiProperty({ enum: Object.values(STOCK_ADJUSTMENT_TYPE) }) adjustmentType: string;
  @ApiProperty() reasonCode: string;
  @ApiPropertyOptional({ type: String, nullable: true }) externalReference?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) sourceName?: string | null;
  @ApiProperty() reason: string;
  @ApiProperty({ type: [InventoryBalanceDto] }) balances: InventoryBalanceDto[];
  @ApiProperty({ format: 'date-time' }) postedAt: string;
}
