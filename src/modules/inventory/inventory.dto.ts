import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
  NotEquals,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
  @ApiProperty() reason: string;
  @ApiProperty({ type: [InventoryBalanceDto] }) balances: InventoryBalanceDto[];
  @ApiProperty({ format: 'date-time' }) postedAt: string;
}
