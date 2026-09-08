import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNumberString, IsString, Length, Min } from 'class-validator';
import { ENTITY_ID_OPENAPI, IsEntityId } from '../../common/identifiers/entity-id';

export class ShippingQuoteRequestDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI })
  @IsEntityId()
  branchId: string;

  @ApiProperty({ example: '79', maxLength: 32 })
  @IsString()
  @Length(1, 32)
  provinceCode: string;

  @ApiProperty({ example: '1890000.00', description: 'VND decimal string' })
  @IsNumberString()
  subtotal: string;

  @ApiProperty({ example: 1500, minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  weightGrams: number;
}

export class ShippingQuoteDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) shippingRateId: string;
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) branchId: string;
  @ApiProperty() zoneCode: string;
  @ApiProperty({ enum: ['VND'] }) currencyCode: string;
  @ApiProperty({ example: '45000.00' }) fee: string;
  @ApiProperty({ minimum: 0 }) etaMinDays: number;
  @ApiProperty({ minimum: 0 }) etaMaxDays: number;
}
