import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
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
    enum: Object.values(ORDER_STATUS_GROUP), enumName: 'OrderStatusGroup',
    description: 'Nhóm trạng thái dùng trực tiếp cho các tab màn quản lý đơn hàng',
  })
  @IsIn(Object.values(ORDER_STATUS_GROUP))
  @IsOptional()
  statusGroup?: string;

  @ApiPropertyOptional({
    maxLength: 100,
    description: 'Tìm gộp theo mã đơn, tên/SĐT/email người nhận. Giữ cho tương thích ngược.',
  })
  @Transform(trimOptional)
  @IsString()
  @MaxLength(100)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ maxLength: 100, description: 'Chỉ lọc theo mã đơn' })
  @Transform(trimOptional)
  @IsString()
  @MaxLength(100)
  @IsOptional()
  orderNo?: string;

  @ApiPropertyOptional({ maxLength: 100, description: 'Chỉ lọc theo tên người nhận' })
  @Transform(trimOptional)
  @IsString()
  @MaxLength(100)
  @IsOptional()
  recipientName?: string;

  @ApiPropertyOptional({ maxLength: 100, description: 'Chỉ lọc theo số điện thoại người nhận' })
  @Transform(trimOptional)
  @IsString()
  @MaxLength(100)
  @IsOptional()
  recipientPhone?: string;
}

export class AccountOrderQueryDto {
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
}

export class OrderCancelCommandDto {
  @ApiProperty({ type: Number, minimum: 0, description: 'Version đơn hàng mà người dùng đang xem' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion: number;

  @ApiProperty({ minLength: 3, maxLength: 500 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

export class CompleteOrderCommandDto {
  @ApiProperty({ type: Number, minimum: 0, description: 'Version đơn hàng mà Admin đang xem' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion: number;

  @ApiProperty({ minLength: 5, maxLength: 500, description: 'Lý do chắc chắn giao đủ và hoàn tất sớm' })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;
}

export class ConfirmOrderCommandDto {
  @ApiProperty({ type: Number, minimum: 0, description: 'Version đơn hàng mà Admin đang xem' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion: number;

  @ApiPropertyOptional({ maxLength: 500, description: 'Ghi chú xác nhận để kho bắt đầu xử lý' })
  @Transform(trimOptional)
  @IsString()
  @MaxLength(500)
  @IsOptional()
  note?: string;
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
  @ApiPropertyOptional({ enum: Object.values(ORDER_STATUS), enumName: 'OrderStatus', nullable: true }) fromStatus: string | null;
  @ApiProperty({ enum: Object.values(ORDER_STATUS), enumName: 'OrderStatus' }) toStatus: string;
  @ApiPropertyOptional({ type: String, nullable: true }) reason: string | null;
  @ApiProperty() actorType: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}

export class OrderSummaryDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) id: string;
  @ApiProperty() orderNo: string;
  @ApiProperty({ enum: Object.values(ORDER_STATUS), enumName: 'OrderStatus' }) status: string;
  @ApiProperty({ enum: Object.values(ORDER_PAYMENT_STATUS), enumName: 'PaymentStatus' }) paymentStatus: string;
  @ApiProperty({ enum: Object.values(ORDER_FULFILLMENT_STATUS), enumName: 'OrderFulfillmentStatus' }) fulfillmentStatus: string;
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
  @ApiProperty({ type: [OrderSummaryDto] }) items: OrderSummaryDto[];
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() total: number;
}

export class AccountOrderListDto extends AdminOrderListDto {}

/**
 * Vận chuyển của đơn cho khách theo dõi. `trackingUrl` chỉ có khi hãng có trang tra cứu công khai
 * (hiện là GHN); vận đơn nhập tay của hãng khác chỉ hiện mã.
 */
export class OrderShipmentDto {
  @ApiProperty({ description: 'Trạng thái fulfillment: PENDING, PICKING, PACKED, SHIPPED, DELIVERED, DELIVERY_FAILED, RETURNED…' }) status: string;
  @ApiPropertyOptional({ type: String, nullable: true, example: 'GHN' }) carrierCode: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, example: 'LXQ7A9' }) trackingNo: string | null;
  @ApiPropertyOptional({ type: String, format: 'uri', nullable: true }) trackingUrl: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) shippedAt: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) deliveredAt: string | null;
}

export class OrderDetailDto extends OrderSummaryDto {
  @ApiProperty() currencyCode: string;
  @ApiProperty() pricesIncludeTax: boolean;
  @ApiProperty() subtotal: string;
  @ApiProperty() discountTotal: string;
  @ApiProperty() shippingTotal: string;
  @ApiProperty() taxTotal: string;
  @ApiPropertyOptional({ type: String, nullable: true }) customerNote: string | null;
  @ApiProperty({ type: [OrderItemDto] }) items: OrderItemDto[];
  @ApiProperty({ type: [OrderStatusHistoryDto] }) statusHistory: OrderStatusHistoryDto[];
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true, description: 'Lúc thanh toán được xác nhận thành công' })
  paidAt: string | null;
  @ApiPropertyOptional({ type: () => OrderShipmentDto, nullable: true, description: 'Null khi đơn chưa có fulfillment' })
  shipment: OrderShipmentDto | null;
}

export class GuestOrderPlacementDto extends OrderDetailDto {
  @ApiProperty({
    description: 'Token bí mật dùng cùng mã đơn để Guest xem/hủy đơn; hiện dùng cùng token của guest cart',
  })
  guestAccessToken: string;
}
