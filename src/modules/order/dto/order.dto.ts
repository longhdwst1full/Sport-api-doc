import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ENTITY_ID_OPENAPI } from '../../../common/identifiers/entity-id';
import {
  ORDER_FULFILLMENT_STATUS,
  ORDER_PAYMENT_STATUS,
  ORDER_STATUS,
  ORDER_STATUS_GROUP,
} from '../order.constants';

const trimOptional = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

export class AdminOrderQueryDto {
  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page = 1;

  @ApiPropertyOptional({ type: Number, default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit = 20;

  @ApiPropertyOptional({
    enum: Object.values(ORDER_STATUS_GROUP),
    description: 'Nhóm trạng thái dùng trực tiếp cho các tab màn quản lý đơn hàng',
  })
  @IsIn(Object.values(ORDER_STATUS_GROUP))
  @IsOptional()
  statusGroup?: string;

  @ApiPropertyOptional({
    maxLength: 100,
    description: 'Tìm theo mã đơn, tên/SĐT/email người nhận',
  })
  @Transform(trimOptional)
  @IsString()
  @MaxLength(100)
  @IsOptional()
  search?: string;
}

export class OrderRecipientDto {
  @ApiProperty() name: string;
  @ApiProperty() phone: string;
  @ApiPropertyOptional({ type: String, nullable: true }) email: string | null;
  @ApiProperty() addressLine: string;
  @ApiPropertyOptional({ type: String, nullable: true }) ward: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) district: string | null;
  @ApiProperty() province: string;
}

export class OrderItemComponentDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) productVariantId: string;
  @ApiProperty() sku: string;
  @ApiProperty() name: string;
  @ApiProperty() quantityPerBundle: number;
  @ApiProperty() totalQuantity: number;
}

export class OrderItemDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) id: string;
  @ApiProperty() lineNo: number;
  @ApiProperty() itemType: string;
  @ApiProperty() sku: string;
  @ApiProperty() productName: string;
  @ApiProperty() variantName: string;
  @ApiPropertyOptional({ type: String, nullable: true }) imageUrl: string | null;
  @ApiProperty() quantity: number;
  @ApiProperty() unitPrice: string;
  @ApiProperty() lineTotal: string;
  @ApiProperty({ type: [OrderItemComponentDto] }) components: OrderItemComponentDto[];
}

export class OrderStatusHistoryDto {
  @ApiProperty() sequenceNo: number;
  @ApiPropertyOptional({ enum: Object.values(ORDER_STATUS), nullable: true }) fromStatus: string | null;
  @ApiProperty({ enum: Object.values(ORDER_STATUS) }) toStatus: string;
  @ApiPropertyOptional({ type: String, nullable: true }) reason: string | null;
  @ApiProperty() actorType: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}

export class AdminOrderSummaryDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) id: string;
  @ApiProperty() orderNo: string;
  @ApiProperty({ enum: Object.values(ORDER_STATUS) }) status: string;
  @ApiProperty({ enum: Object.values(ORDER_PAYMENT_STATUS) }) paymentStatus: string;
  @ApiProperty({ enum: Object.values(ORDER_FULFILLMENT_STATUS) }) fulfillmentStatus: string;
  @ApiProperty() paymentMethod: string;
  @ApiProperty() shippingMethod: string;
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) branchId: string;
  @ApiProperty() branchName: string;
  @ApiProperty() warehouseName: string;
  @ApiProperty() grandTotal: string;
  @ApiProperty() itemCount: number;
  @ApiProperty({ type: OrderRecipientDto }) recipient: OrderRecipientDto;
  @ApiProperty({ format: 'date-time' }) placedAt: string;
  @ApiProperty() version: number;
}

export class AdminOrderListDto {
  @ApiProperty({ type: [AdminOrderSummaryDto] }) items: AdminOrderSummaryDto[];
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() total: number;
}

export class OrderDetailDto extends AdminOrderSummaryDto {
  @ApiProperty() currencyCode: string;
  @ApiProperty() pricesIncludeTax: boolean;
  @ApiProperty() subtotal: string;
  @ApiProperty() discountTotal: string;
  @ApiProperty() shippingTotal: string;
  @ApiProperty() taxTotal: string;
  @ApiPropertyOptional({ type: String, nullable: true }) customerNote: string | null;
  @ApiProperty({ type: [OrderItemDto] }) items: OrderItemDto[];
  @ApiProperty({ type: [OrderStatusHistoryDto] }) statusHistory: OrderStatusHistoryDto[];
}

