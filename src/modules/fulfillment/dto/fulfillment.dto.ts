import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ENTITY_ID_OPENAPI } from '../../../common/identifiers/entity-id';
import { FULFILLMENT_STATUS, RETURN_CONDITION } from '../fulfillment.constants';

const trimOptional = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() || undefined : value;

export class AdminFulfillmentQueryDto {
  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1 })
  @Type(() => Number) @IsInt() @Min(1) @IsOptional() page = 1;

  @ApiPropertyOptional({ type: Number, default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional() limit = 20;

  @ApiPropertyOptional({ enum: Object.values(FULFILLMENT_STATUS) })
  @IsIn(Object.values(FULFILLMENT_STATUS)) @IsOptional() status?: string;

  @ApiPropertyOptional({ maxLength: 100, description: 'Mã fulfillment, mã đơn, tracking, tên hoặc SĐT người nhận' })
  @Transform(trimOptional) @IsString() @MaxLength(100) @IsOptional() search?: string;
}

export class FulfillmentTransitionDto {
  @ApiProperty({ type: String, pattern: '^\\d+$' })
  @IsString() expectedVersion: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @Transform(trimOptional) @IsString() @MaxLength(500) @IsOptional() note?: string;
}

export class ShipFulfillmentDto extends FulfillmentTransitionDto {
  @ApiPropertyOptional({ maxLength: 64 })
  @Transform(trimOptional) @IsString() @MaxLength(64) @IsOptional() carrierCode?: string;

  @ApiPropertyOptional({ maxLength: 128 })
  @Transform(trimOptional) @IsString() @MaxLength(128) @IsOptional() trackingNo?: string;
}

export class FailDeliveryDto extends FulfillmentTransitionDto {
  @ApiProperty({ minLength: 2, maxLength: 64 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(2) @MaxLength(64) reasonCode: string;

  @ApiProperty({ minLength: 5, maxLength: 500 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(5) @MaxLength(500) reason: string;
}

export class ReceiveReturnDto extends FulfillmentTransitionDto {
  @ApiProperty({ enum: Object.values(RETURN_CONDITION) })
  @IsIn(Object.values(RETURN_CONDITION)) condition: string;

  @ApiProperty({ minLength: 5, maxLength: 500 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(5) @MaxLength(500) reason: string;
}

export class FulfillmentHistoryDto {
  @ApiProperty() sequenceNo: number;
  @ApiPropertyOptional({ type: String, nullable: true }) fromStatus: string | null;
  @ApiProperty({ enum: Object.values(FULFILLMENT_STATUS) }) toStatus: string;
  @ApiPropertyOptional({ type: String, nullable: true }) reason: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}

export class FulfillmentSummaryDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) id: string;
  @ApiProperty() fulfillmentNo: string;
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) orderId: string;
  @ApiProperty() orderNo: string;
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) warehouseId: string;
  @ApiProperty() warehouseName: string;
  @ApiProperty({ enum: Object.values(FULFILLMENT_STATUS) }) status: string;
  @ApiPropertyOptional({ type: String, nullable: true }) carrierCode: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) trackingNo: string | null;
  @ApiProperty() recipientName: string;
  @ApiProperty() recipientPhone: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty() version: string;
}

export class AdminFulfillmentListDto {
  @ApiProperty({ type: [FulfillmentSummaryDto] }) items: FulfillmentSummaryDto[];
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() total: number;
}

export class FulfillmentDetailDto extends FulfillmentSummaryDto {
  @ApiProperty() orderStatus: string;
  @ApiProperty() paymentStatus: string;
  @ApiProperty() paymentMethod: string;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) pickedAt: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) packedAt: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) shippedAt: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) deliveredAt: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) deliveryFailureReasonCode: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) returnedToWarehouseAt: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) returnCondition: string | null;
  @ApiProperty({ type: [FulfillmentHistoryDto] }) history: FulfillmentHistoryDto[];
}
