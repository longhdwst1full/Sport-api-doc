import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { ENTITY_ID_OPENAPI } from '../../../common/identifiers/entity-id';
import { PAYMENT_EVIDENCE_STATUS, PAYMENT_METHOD, PAYMENT_STATUS } from '../payment.constants';

const MONEY_PATTERN = /^\d{1,17}(\.\d{1,2})?$/;

export class PaymentEvidenceDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) id: string;
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) mediaAssetId: string;
  @ApiProperty({ format: 'uri' }) fileUrl: string;
  @ApiProperty({ format: 'uri' }) thumbnailUrl: string;
  @ApiProperty() mimeType: string;
  @ApiProperty() sizeBytes: number;
  @ApiProperty({ enum: Object.values(PAYMENT_EVIDENCE_STATUS) }) status: string;
  @ApiPropertyOptional() note?: string;
  @ApiPropertyOptional() reviewReason?: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiPropertyOptional({ format: 'date-time' }) reviewedAt?: string;
}

export class PaymentInstructionDto {
  @ApiProperty({ enum: Object.values(PAYMENT_METHOD) }) method: string;
  @ApiProperty() provider: string;
  @ApiProperty() reference: string;
  @ApiProperty() customerMessage: string;
}

export class PaymentDetailDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) id: string;
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) orderId: string;
  @ApiProperty() orderNo: string;
  @ApiProperty({ description: 'Trạng thái đơn hàng dùng để kiểm soát thời điểm thu COD' }) orderStatus: string;
  @ApiProperty() paymentRef: string;
  @ApiProperty({ enum: Object.values(PAYMENT_METHOD) }) method: string;
  @ApiProperty({ enum: Object.values(PAYMENT_STATUS) }) status: string;
  @ApiProperty() expectedAmount: string;
  @ApiProperty() receivedAmount: string;
  @ApiProperty({ enum: ['VND'] }) currencyCode: string;
  @ApiPropertyOptional({ format: 'date-time' }) expiresAt?: string;
  @ApiPropertyOptional({ format: 'date-time' }) confirmedAt?: string;
  @ApiPropertyOptional() failureReason?: string;
  @ApiProperty() version: string;
  @ApiProperty({ type: PaymentInstructionDto }) instruction: PaymentInstructionDto;
  @ApiProperty({ type: [PaymentEvidenceDto] }) evidences: PaymentEvidenceDto[];
}

export class SubmitPaymentEvidenceDto {
  @ApiProperty({ example: 'sport-sys/sport/payment-evidence/PAY-ORDER-001/asset-id' })
  @IsString()
  @IsNotEmpty()
  publicId: string;

  @ApiProperty({ example: 1787999000 })
  @IsInt()
  @Min(1)
  providerVersion: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  providerSignature: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiProperty({ pattern: '^\\d+$', description: 'Payment version đã đọc trước khi gửi bằng chứng' })
  @IsString()
  @Matches(/^\d+$/)
  expectedVersion: string;
}

export class ConfirmPaymentDto {
  @ApiProperty({ pattern: '^\\d+$' })
  @IsString()
  @Matches(/^\d+$/)
  expectedVersion: string;

  @ApiProperty({ example: '1490000.00', pattern: MONEY_PATTERN.source })
  @IsString()
  @Matches(MONEY_PATTERN)
  receivedAmount: string;

  @ApiProperty({ example: 'VCB-20260912-001', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  reference: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class RejectPaymentDto {
  @ApiProperty({ pattern: '^\\d+$' })
  @IsString()
  @Matches(/^\d+$/)
  expectedVersion: string;

  @ApiProperty({ minLength: 3, maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}

export class AdminPaymentQueryDto {
  @ApiPropertyOptional({ type: Number, minimum: 1, default: 1 })
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 20 })
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ enum: Object.values(PAYMENT_STATUS) })
  @IsOptional()
  @IsIn(Object.values(PAYMENT_STATUS))
  status?: string;

  @ApiPropertyOptional({ enum: Object.values(PAYMENT_METHOD) })
  @IsOptional()
  @IsIn(Object.values(PAYMENT_METHOD))
  method?: string;

  @ApiPropertyOptional({ description: 'Mã thanh toán, mã đơn, tên hoặc SĐT người nhận' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;
}

export class AdminPaymentSummaryDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) id: string;
  @ApiProperty() paymentRef: string;
  @ApiProperty() orderNo: string;
  @ApiProperty() recipientName: string;
  @ApiProperty() recipientPhone: string;
  @ApiProperty({ enum: Object.values(PAYMENT_METHOD) }) method: string;
  @ApiProperty({ enum: Object.values(PAYMENT_STATUS) }) status: string;
  @ApiProperty() expectedAmount: string;
  @ApiProperty() receivedAmount: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty() version: string;
}

export class AdminPaymentListDto {
  @ApiProperty({ type: [AdminPaymentSummaryDto] }) items: AdminPaymentSummaryDto[];
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() total: number;
}
