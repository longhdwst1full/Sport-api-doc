import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNotEmpty, IsString, ValidateNested } from 'class-validator';
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
  @ApiProperty() @IsString() @IsNotEmpty() sku: string;
  @ApiProperty({ example: 5 }) @IsInt() quantityDelta: number;
}

export class CreateStockAdjustmentDto {
  @ApiProperty({ example: 'WH-HCM-01' }) @IsString() @IsNotEmpty() warehouseCode: string;
  @ApiProperty() @IsString() @IsNotEmpty() reason: string;
  @ApiProperty({ type: [StockAdjustmentItemInputDto] })
  @IsArray()
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
