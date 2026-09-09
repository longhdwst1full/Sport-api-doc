import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsInt, IsNumber, IsNumberString, IsOptional, IsString, Length, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { ENTITY_ID_OPENAPI, IsEntityId } from '../../common/identifiers/entity-id';
import { CHECKOUT_PAYMENT_METHOD, CHECKOUT_STATUS } from './checkout.constants';

export class CheckoutRecipientDto {
  @ApiProperty({ example: 'Nguyễn Văn An' })
  @IsString()
  @Length(1, 255)
  recipient: string;

  @ApiProperty({ example: '0912345678' })
  @IsString()
  @Length(8, 32)
  phone: string;

  @ApiPropertyOptional({ example: 'an@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ example: '12 Nguyễn Trãi' })
  @IsString()
  @Length(1, 500)
  addressLine: string;

  @ApiPropertyOptional({ example: 'Phường Bến Thành' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  ward?: string;

  @ApiProperty({ example: 'Quận 1' })
  @IsString()
  @Length(1, 255)
  district: string;

  @ApiProperty({ example: 'TP. Hồ Chí Minh' })
  @IsString()
  @Length(1, 255)
  province: string;

  @ApiProperty({ example: '79' })
  @IsString()
  @Length(1, 32)
  provinceCode: string;

  @ApiPropertyOptional({ example: '1454' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  districtCode?: string;

  @ApiPropertyOptional({ example: '21211' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  wardCode?: string;

  @ApiPropertyOptional({ example: 10.7769, minimum: -90, maximum: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ example: 106.7009, minimum: -180, maximum: 180 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;
}

export class CreateCheckoutQuoteDto {
  @ApiProperty({ type: CheckoutRecipientDto })
  @ValidateNested()
  @Type(() => CheckoutRecipientDto)
  recipient: CheckoutRecipientDto;

  @ApiProperty({ enum: Object.values(CHECKOUT_PAYMENT_METHOD), example: 'BANK_TRANSFER' })
  @IsIn(Object.values(CHECKOUT_PAYMENT_METHOD))
  paymentMethod: string;

  @ApiPropertyOptional({ default: false, description: 'Request a staff-agreed fee/ETA for coach bus or special delivery' })
  @IsOptional()
  @IsBoolean()
  requestShippingConsultation?: boolean;

  @ApiPropertyOptional({ maxLength: 1000, example: 'Gọi trước khi giao hàng' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class CheckoutQuoteItemDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) productVariantId: string;
  @ApiProperty() sku: string;
  @ApiProperty() name: string;
  @ApiProperty() quantity: number;
  @ApiProperty() unitPrice: string;
  @ApiProperty() lineTotal: string;
}

export class CheckoutQuoteDto {
  @ApiProperty({ description: 'Opaque token used to confirm this exact quote' }) checkoutToken: string;
  @ApiProperty({ enum: ['QUOTED', 'AWAITING_SHIPPING_CONSULTATION'] }) status: string;
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) branchId: string;
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) warehouseId: string;
  @ApiProperty() branchName: string;
  @ApiProperty({ enum: ['BANK_TRANSFER', 'COD'] }) paymentMethod: string;
  @ApiProperty({ enum: ['BRANCH_FREE', 'STANDARD_DELIVERY', 'THIRD_PARTY', 'MANUAL_EXTERNAL'] }) shippingMethod: string;
  @ApiPropertyOptional({ type: String, nullable: true }) shippingProvider: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) distanceKm: string | null;
  @ApiProperty() itemSubtotal: string;
  @ApiPropertyOptional({ type: String, nullable: true }) shippingTotal: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) grandTotal: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) etaMinDays: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) etaMaxDays: number | null;
  @ApiProperty() requiresShippingConsultation: boolean;
  @ApiProperty({ type: [CheckoutQuoteItemDto] }) items: CheckoutQuoteItemDto[];
  @ApiProperty({ format: 'date-time' }) expiresAt: string;
}

export class AdminShippingConsultationDto extends CheckoutQuoteDto {
  @ApiProperty({ example: 0 }) version: number;
  @ApiProperty({ type: CheckoutRecipientDto }) recipient: CheckoutRecipientDto;
  @ApiPropertyOptional({ type: String, nullable: true }) customerNote: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}

export class AdminShippingConsultationListDto {
  @ApiProperty({ type: [AdminShippingConsultationDto] }) items: AdminShippingConsultationDto[];
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 20 }) limit: number;
  @ApiProperty({ example: 1 }) total: number;
}

export class AdminShippingConsultationQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number) @IsInt() @Min(1) @IsOptional() page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional() limit: number = 20;

  @ApiPropertyOptional({ enum: [CHECKOUT_STATUS.AWAITING_SHIPPING_CONSULTATION, CHECKOUT_STATUS.QUOTED], default: CHECKOUT_STATUS.AWAITING_SHIPPING_CONSULTATION })
  @IsIn([CHECKOUT_STATUS.AWAITING_SHIPPING_CONSULTATION, CHECKOUT_STATUS.QUOTED])
  @IsOptional()
  status: string = CHECKOUT_STATUS.AWAITING_SHIPPING_CONSULTATION;

  @ApiPropertyOptional({ ...ENTITY_ID_OPENAPI })
  @IsEntityId()
  @IsOptional()
  branchId?: string;
}

export class UpdateManualShippingQuoteDto {
  @ApiProperty({ example: '150000.00' })
  @IsNumberString()
  shippingFee: string;

  @ApiProperty({ minimum: 0, example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  etaMinDays: number;

  @ApiProperty({ minimum: 0, example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  etaMaxDays: number;

  @ApiPropertyOptional({ example: 'XE_KHACH' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  provider?: string;

  @ApiProperty({ example: 'Khách đồng ý phí 150.000đ qua điện thoại lúc 10:30' })
  @IsString()
  @Length(10, 1000)
  agreementNote: string;

  @ApiProperty({ minimum: 0, example: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion: number;
}

export class ReleaseReservationDto {
  @ApiProperty({ example: 'Khách đổi ý trước khi bàn giao hàng' })
  @IsString()
  @Length(3, 500)
  reason: string;
}

export class ReservationItemDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) productVariantId: string;
  @ApiProperty({ minimum: 1 }) quantity: number;
}

export class ReservationDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) id: string;
  @ApiProperty({ description: 'Opaque token used to release this reservation' }) reservationToken: string;
  @ApiProperty({ enum: ['ACTIVE', 'RELEASED', 'EXPIRED', 'COMMITTED'] }) status: string;
  @ApiProperty({ format: 'date-time' }) expiresAt: string;
  @ApiProperty({ type: [ReservationItemDto] }) items: ReservationItemDto[];
}
