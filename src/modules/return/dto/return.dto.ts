import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ENTITY_ID_OPENAPI, IsEntityId } from '../../../common/identifiers/entity-id';
import { CreateMediaUploadDto } from '../../media/media.dto';
import {
  REFUND_METHOD,
  REFUND_STATUS,
  RETURN_ACTION,
  RETURN_CHANNEL,
  RETURN_FAULT,
  RETURN_ITEM_CONDITION,
  RETURN_ITEM_DISPOSITION,
  RETURN_LIMITS,
  RETURN_REASON_CODE,
  RETURN_STATUS,
} from '../return.constants';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimOptional = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

const MONEY_PATTERN = /^\d{1,17}(\.\d{1,2})?$/;
const VERSION_OPENAPI = { type: String, pattern: '^\\d+$', example: '0' } as const;

class PageQueryDto {
  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1 })
  @Type(() => Number) @IsInt() @Min(1) @IsOptional() page = 1;

  @ApiPropertyOptional({ type: Number, default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional() limit = 20;
}

export class AccountReturnQueryDto extends PageQueryDto {}

export class AdminReturnQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: Object.values(RETURN_STATUS) })
  @IsIn(Object.values(RETURN_STATUS)) @IsOptional() status?: string;

  @ApiPropertyOptional({ maxLength: 100, description: 'Mã phiếu trả, mã đơn hoặc tên/SĐT người nhận' })
  @Transform(trimOptional) @IsString() @MaxLength(100) @IsOptional() search?: string;
}

export class ReturnLineInputDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) @IsEntityId() orderItemId: string;

  @ApiProperty({ minimum: 1, description: 'Combo phải bằng toàn bộ số bộ còn trả được của dòng' })
  @IsInt() @Min(1) quantity: number;
}

/** Ảnh đã tải lên Cloudinary bằng chữ ký do API cấp; server xác minh lại trước khi lưu. */
export class ReturnEvidenceInputDto {
  @ApiProperty({ example: 'sport-sys/sport/return-evidence/o9/8ece7be0-b7da-4ff1-a37e-fdd473b08d5e' })
  @IsString() @MinLength(1) @MaxLength(500) publicId: string;

  @ApiProperty({ example: 1787999000 }) @IsInt() @Min(1) providerVersion: number;

  @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) providerSignature: string;
}

export class CreateAccountReturnEvidenceUploadDto extends CreateMediaUploadDto {
  @ApiProperty({ maxLength: 40, example: 'ORD-20260924-0001' })
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(40) orderNo: string;
}

export class CreateAdminReturnEvidenceUploadDto extends CreateMediaUploadDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) @IsEntityId() orderId: string;
}

class CreateReturnBaseDto {
  @ApiProperty({ enum: Object.values(RETURN_REASON_CODE) })
  @IsIn(Object.values(RETURN_REASON_CODE)) reasonCode: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @Transform(trimOptional) @IsString() @MaxLength(2000) @IsOptional() description?: string;

  @ApiPropertyOptional({
    type: [ReturnEvidenceInputDto],
    maxItems: RETURN_LIMITS.MAX_EVIDENCE_IMAGES,
    description: 'Ảnh minh chứng đã tải lên bằng chữ ký upload của đơn này. Ảnh và mô tả đều không bắt buộc',
  })
  @IsArray() @ArrayMaxSize(RETURN_LIMITS.MAX_EVIDENCE_IMAGES)
  @ValidateNested({ each: true }) @Type(() => ReturnEvidenceInputDto)
  @IsOptional() evidenceImages?: ReturnEvidenceInputDto[];

  @ApiProperty({ type: [ReturnLineInputDto], minItems: 1, maxItems: RETURN_LIMITS.MAX_ITEMS })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(RETURN_LIMITS.MAX_ITEMS)
  @ValidateNested({ each: true }) @Type(() => ReturnLineInputDto)
  items: ReturnLineInputDto[];
}

export class CreateAccountReturnDto extends CreateReturnBaseDto {
  @ApiProperty({ maxLength: 40, example: 'ORD-20260924-0001' })
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(40) orderNo: string;
}

export class CreateAdminReturnDto extends CreateReturnBaseDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) @IsEntityId() orderId: string;

  @ApiPropertyOptional({
    enum: Object.values(RETURN_FAULT),
    description: 'Bắt buộc khi người tạo có quyền return.decide: phiếu được duyệt ngay (D56)',
  })
  @IsIn(Object.values(RETURN_FAULT)) @IsOptional() fault?: string;

  @ApiPropertyOptional({
    minLength: 5,
    maxLength: 500,
    description: 'Lý do nhận trả khi đã quá hạn; cần quyền return.window.override',
  })
  @Transform(trimOptional) @IsString() @MinLength(5) @MaxLength(500) @IsOptional() windowOverrideNote?: string;
}

export class ReturnCommandDto {
  @ApiProperty(VERSION_OPENAPI) @IsString() @Matches(/^\d+$/) expectedVersion: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @Transform(trimOptional) @IsString() @MaxLength(500) @IsOptional() note?: string;
}

export class ApproveReturnDto extends ReturnCommandDto {
  @ApiProperty({ enum: Object.values(RETURN_FAULT), description: 'SHOP thì hoàn thêm phí giao ban đầu (D57)' })
  @IsIn(Object.values(RETURN_FAULT)) fault: string;
}

export class ReturnReasonCommandDto {
  @ApiProperty(VERSION_OPENAPI) @IsString() @Matches(/^\d+$/) expectedVersion: string;

  @ApiProperty({ minLength: 5, maxLength: 500 })
  @Transform(trim) @IsString() @MinLength(5) @MaxLength(500) reason: string;
}

export class InspectReturnItemDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) @IsEntityId() returnItemId: string;

  @ApiProperty({ enum: Object.values(RETURN_ITEM_CONDITION) })
  @IsIn(Object.values(RETURN_ITEM_CONDITION)) condition: string;

  @ApiPropertyOptional({
    enum: Object.values(RETURN_ITEM_DISPOSITION),
    description: 'Bắt buộc với DAMAGED (HOLD hoặc WRITE_OFF); SELLABLE luôn RESTOCK, MISSING luôn WRITE_OFF',
  })
  @IsIn(Object.values(RETURN_ITEM_DISPOSITION)) @IsOptional() disposition?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @Transform(trimOptional) @IsString() @MaxLength(500) @IsOptional() note?: string;
}

export class InspectReturnDto extends ReturnCommandDto {
  @ApiProperty({ type: [InspectReturnItemDto], minItems: 1, description: 'Phải có đủ mọi dòng của phiếu' })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(RETURN_LIMITS.MAX_ITEMS)
  @ValidateNested({ each: true }) @Type(() => InspectReturnItemDto)
  items: InspectReturnItemDto[];
}

export class CreateRefundDto extends ReturnCommandDto {
  @ApiProperty({ enum: Object.values(REFUND_METHOD) })
  @IsIn(Object.values(REFUND_METHOD)) method: string;

  @ApiProperty({ type: String, pattern: MONEY_PATTERN.source, example: '570000.00' })
  @IsString() @Matches(MONEY_PATTERN) amount: string;
}

export class ConfirmRefundDto {
  @ApiProperty(VERSION_OPENAPI) @IsString() @Matches(/^\d+$/) expectedVersion: string;

  @ApiPropertyOptional({
    maxLength: 255,
    description: 'Bắt buộc với BANK_TRANSFER: mã giao dịch ngân hàng. CASH: số biên nhận nếu có',
  })
  @Transform(trimOptional) @IsString() @MaxLength(255) @IsOptional() externalRef?: string;

  @ApiPropertyOptional({ description: 'Bắt buộc true với CASH: người xác nhận đã đưa tiền cho khách' })
  @IsBoolean() @IsOptional() cashHandedOver?: boolean;

  @ApiPropertyOptional({
    type: [ReturnEvidenceInputDto],
    maxItems: RETURN_LIMITS.MAX_EVIDENCE_IMAGES,
    description: 'Ảnh chứng từ (biên lai, màn hình chuyển khoản) tải lên bằng chữ ký upload chứng từ của phiếu; lưu để đối chiếu',
  })
  @IsArray() @ArrayMaxSize(RETURN_LIMITS.MAX_EVIDENCE_IMAGES)
  @ValidateNested({ each: true }) @Type(() => ReturnEvidenceInputDto)
  @IsOptional() proofImages?: ReturnEvidenceInputDto[];
}

export class ReturnEvidenceImageDto {
  @ApiProperty({ format: 'uri' }) url: string;
  @ApiProperty({ format: 'uri' }) thumbnailUrl: string;
  @ApiProperty() width: number;
  @ApiProperty() height: number;
}

export class ReturnItemDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) id: string;
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) orderItemId: string;
  @ApiProperty() sku: string;
  @ApiProperty() productName: string;
  @ApiProperty() variantName: string;
  @ApiProperty({ enum: ['STANDARD', 'BUNDLE'] }) itemType: string;
  @ApiProperty() quantity: number;
  @ApiProperty({ type: String, example: '350000.00' }) unitPrice: string;
  @ApiPropertyOptional({ enum: Object.values(RETURN_ITEM_CONDITION), nullable: true }) condition: string | null;
  @ApiPropertyOptional({ enum: Object.values(RETURN_ITEM_DISPOSITION), nullable: true }) disposition: string | null;
  @ApiProperty() restockQty: number;
  @ApiPropertyOptional({ type: String, nullable: true }) refundCap: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) note: string | null;
}

export class RefundDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) id: string;
  @ApiProperty() refundNo: string;
  @ApiProperty({ enum: Object.values(REFUND_METHOD) }) method: string;
  @ApiProperty({ type: String, example: '570000.00' }) amount: string;
  @ApiProperty({ enum: Object.values(REFUND_STATUS) }) status: string;
  @ApiPropertyOptional({ type: String, nullable: true }) externalRef: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) note: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) failureReason: string | null;
  @ApiProperty({ type: [ReturnEvidenceImageDto], description: 'Chứng từ lưu khi xác nhận; không trả cho khách' })
  proofImages: ReturnEvidenceImageDto[];
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) processedAt: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty() version: string;
}

export class ReturnHistoryDto {
  @ApiProperty() sequenceNo: number;
  @ApiProperty({ enum: Object.values(RETURN_ACTION) }) action: string;
  @ApiPropertyOptional({ type: String, nullable: true }) fromStatus: string | null;
  @ApiProperty({ enum: Object.values(RETURN_STATUS) }) toStatus: string;
  @ApiPropertyOptional({ type: String, nullable: true }) reason: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}

export class ReturnSummaryDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) id: string;
  @ApiProperty({ example: 'RMA-20260924-000001' }) returnNo: string;
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) orderId: string;
  @ApiProperty() orderNo: string;
  @ApiProperty({ enum: Object.values(RETURN_STATUS) }) status: string;
  @ApiProperty({ enum: Object.values(RETURN_CHANNEL) }) channel: string;
  @ApiProperty({ enum: Object.values(RETURN_REASON_CODE) }) reasonCode: string;
  @ApiPropertyOptional({ enum: Object.values(RETURN_FAULT), nullable: true }) fault: string | null;
  @ApiProperty() recipientName: string;
  @ApiProperty() itemCount: number;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty() version: string;
}

export class ReturnDetailDto extends ReturnSummaryDto {
  @ApiPropertyOptional({ type: String, nullable: true }) description: string | null;
  @ApiProperty({ type: [ReturnEvidenceImageDto] }) evidenceImages: ReturnEvidenceImageDto[];
  @ApiProperty({ format: 'date-time' }) deliveredAt: string;
  @ApiProperty() windowOverridden: boolean;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Chỉ trả cho Admin' }) windowOverrideNote: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) decisionNote: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) decidedAt: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) receivedAt: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) closedAt: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Trần tiền hoàn, có sau khi nhận hàng' }) refundCap: string | null;
  @ApiProperty({
    type: String,
    description: 'Số tiền hoàn DỰ KIẾN để hiển thị; bằng refundCap sau khi nhận hàng, trước đó là ước tính có thể thay đổi',
  })
  estimatedRefundAmount: string;
  @ApiProperty({ type: String }) refundedAmount: string;
  @ApiProperty({ type: String }) pendingRefundAmount: string;
  @ApiProperty({ type: String, description: 'Số tiền còn được hoàn, đã chặn theo cả phiếu và số tiền đã thu' })
  refundableAmount: string;
  @ApiProperty({ enum: Object.values(REFUND_METHOD), isArray: true }) allowedRefundMethods: string[];
  @ApiProperty({ type: [ReturnItemDto] }) items: ReturnItemDto[];
  @ApiProperty({ type: [RefundDto] }) refunds: RefundDto[];
  @ApiProperty({ type: [ReturnHistoryDto] }) history: ReturnHistoryDto[];
}

export class ReturnListDto {
  @ApiProperty({ type: [ReturnSummaryDto] }) items: ReturnSummaryDto[];
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() total: number;
}

export class ReturnEligibilityLineDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) orderItemId: string;
  @ApiProperty() sku: string;
  @ApiProperty() productName: string;
  @ApiProperty() variantName: string;
  @ApiPropertyOptional({ type: String, nullable: true }) imageUrl: string | null;
  @ApiProperty({ description: 'Combo: chỉ được trả đúng returnableQuantity, không trả lẻ' }) isBundle: boolean;
  @ApiProperty() purchasedQuantity: number;
  @ApiProperty({ description: 'Đã nằm trên phiếu khác chưa bị từ chối/huỷ' }) returnedQuantity: number;
  @ApiProperty({ description: '0 khi đã trả hết hoặc danh mục không áp dụng đổi trả' }) returnableQuantity: number;
  @ApiProperty() blockedByCategory: boolean;
  @ApiProperty({ type: String, description: 'Tiền hoàn ước tính cho 1 sản phẩm (làm tròn xuống)' }) unitRefundEstimate: string;
  @ApiProperty({ type: String, description: 'Tiền hoàn ước tính khi trả toàn bộ returnableQuantity' }) maxRefundEstimate: string;
}

export class ReturnEligibilityDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) orderId: string;
  @ApiProperty() orderNo: string;
  @ApiProperty({ description: 'false thì FE tắt nút tạo phiếu và hiển thị reason' }) eligible: boolean;
  @ApiPropertyOptional({
    enum: ['ORDER_NOT_RETURNABLE', 'OPEN_RETURN_EXISTS', 'WINDOW_EXPIRED', 'NOTHING_RETURNABLE'],
    nullable: true,
  })
  reason: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) deliveredAt: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) returnDeadline: string | null;
  @ApiProperty() windowDays: number;
  @ApiProperty() withinWindow: boolean;
  @ApiProperty({ description: 'Chỉ Admin: quá hạn nhưng tài khoản được override, phải nhập windowOverrideNote' })
  windowOverrideRequired: boolean;
  @ApiPropertyOptional({ type: String, nullable: true }) openReturnNo: string | null;
  @ApiProperty({ type: [ReturnEligibilityLineDto] }) items: ReturnEligibilityLineDto[];
}

export class AdminReturnQueueSummaryDto {
  @ApiProperty({ description: 'REQUESTED: chờ duyệt' }) awaitingDecision: number;
  @ApiProperty({ description: 'APPROVED: chờ nhận hàng' }) awaitingReceipt: number;
  @ApiProperty({ description: 'RECEIVED: đã nhận hàng, chờ hoàn tiền hoặc đóng phiếu' }) awaitingRefund: number;
  @ApiProperty({ description: 'REFUNDED: chờ đóng phiếu' }) awaitingClose: number;
  @ApiProperty({ description: 'Lượt hoàn PENDING chờ xác nhận' }) pendingRefunds: number;
  @ApiProperty({ description: 'Lượt hoàn PENDING quá 24 giờ' }) overdueRefunds: number;
}
