import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

import { ENTITY_ID_OPENAPI, IsEntityId } from '../../common/identifiers/entity-id';

export class SetCartItemDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI })
  @IsEntityId()
  productVariantId: string;

  @ApiProperty({ minimum: 1, example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ minimum: 0, example: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedCartVersion: number;
}

export class UpdateCartItemDto {
  @ApiProperty({ minimum: 1, example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ minimum: 0, example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedCartVersion: number;
}

export class MutateCartDto {
  @ApiProperty({ minimum: 0, example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedCartVersion: number;
}

export class CartItemDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) id: string;
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) productVariantId: string;
  @ApiProperty() sku: string;
  @ApiProperty() name: string;
  @ApiProperty() productName: string;
  @ApiProperty() productSlug: string;
  @ApiProperty({ minimum: 1 }) quantity: number;
  @ApiPropertyOptional({ type: String, example: '890000.00', nullable: true })
  unitPricePreview: string | null;
  @ApiPropertyOptional({ type: String, example: '1780000.00', nullable: true })
  lineTotalPreview: string | null;
  @ApiPropertyOptional({ type: String, format: 'uri', nullable: true }) imageUrl: string | null;
}

export class CartDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) id: string;
  @ApiProperty({ enum: ['ACTIVE'] }) status: string;
  @ApiProperty({ enum: ['VND'] }) currencyCode: string;
  @ApiProperty({ minimum: 0 }) version: number;
  @ApiProperty({ type: [CartItemDto] }) items: CartItemDto[];
  @ApiProperty({ type: String, example: '1780000.00' }) subtotalPreview: string;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) expiresAt: string | null;
}

export class GuestCartDto extends CartDto {
  @ApiPropertyOptional({
    description: 'Returned only when a new guest cart is created; store securely on the client',
  })
  cartToken?: string;
}
