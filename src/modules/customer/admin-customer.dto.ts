import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ENTITY_ID_OPENAPI } from '../../common/identifiers/entity-id';

/** Khách có tài khoản đăng nhập là MEMBER; khách mua không đăng ký là GUEST. */
export const CUSTOMER_KINDS = ['MEMBER', 'GUEST'] as const;
export type CustomerKind = (typeof CUSTOMER_KINDS)[number];

export const CUSTOMER_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export class AdminCustomerQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ maxLength: 255, description: 'Lọc theo tên khách' })
  @IsOptional() @IsString() @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ maxLength: 32, description: 'Lọc theo số điện thoại' })
  @IsOptional() @IsString() @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional({ maxLength: 255, description: 'Lọc theo email' })
  @IsOptional() @IsString() @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ enum: CUSTOMER_STATUSES })
  @IsOptional() @IsIn(CUSTOMER_STATUSES)
  status?: CustomerStatus;

  @ApiPropertyOptional({ enum: CUSTOMER_KINDS })
  @IsOptional() @IsIn(CUSTOMER_KINDS)
  kind?: CustomerKind;
}

export class AdminCustomerSummaryDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) id: string;
  @ApiProperty({ example: 'KH-000128' }) customerNo: string;
  @ApiProperty({ example: 'Nguyễn Minh Anh' }) name: string;
  @ApiProperty({ type: String, nullable: true }) email: string | null;
  @ApiProperty({ type: String, nullable: true }) phone: string | null;
  @ApiProperty({ enum: CUSTOMER_STATUSES }) status: string;

  @ApiProperty({
    enum: CUSTOMER_KINDS,
    description: 'Suy từ việc khách có tài khoản đăng nhập hay không',
  })
  kind: CustomerKind;

  @ApiProperty({ description: 'Khách có đồng ý nhận tin khuyến mãi' })
  marketingConsent: boolean;

  @ApiProperty({ description: 'Số đơn đã đặt, không tính đơn đã huỷ' })
  orderCount: number;

  @ApiProperty({
    type: String,
    example: '12480000.00',
    description: 'Tổng tiền khách đã thực trả (đơn đã thanh toán, chưa huỷ)',
  })
  lifetimeValue: string;

  @ApiProperty({ type: String, nullable: true, description: 'Thời điểm đặt đơn gần nhất' })
  lastOrderAt: string | null;

  @ApiProperty() createdAt: string;
}

export class AdminCustomerListDto {
  @ApiProperty({ type: [AdminCustomerSummaryDto] }) items: AdminCustomerSummaryDto[];
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 20 }) limit: number;
  @ApiProperty({ example: 42 }) total: number;
}

export class AdminCustomerAddressDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) id: string;
  @ApiProperty() recipient: string;
  @ApiProperty() phone: string;
  @ApiProperty() addressLine: string;
  @ApiProperty({ type: String, nullable: true }) ward: string | null;
  @ApiProperty({ type: String, nullable: true }) district: string | null;

  @ApiProperty({
    example: '01',
    description: 'Mã tỉnh/thành. Bảng địa chỉ chỉ lưu mã, không lưu tên.',
  })
  provinceCode: string;
  @ApiProperty() isDefault: boolean;
}

export class AdminCustomerOrderDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) id: string;
  @ApiProperty({ example: 'ORD-20260915-00000025' }) orderNo: string;
  @ApiProperty() status: string;
  @ApiProperty() paymentStatus: string;
  @ApiProperty({ type: String, example: '36100000.00' }) grandTotal: string;
  @ApiProperty() placedAt: string;
}

export class AdminCustomerDetailDto extends AdminCustomerSummaryDto {
  @ApiProperty({ type: [AdminCustomerAddressDto] }) addresses: AdminCustomerAddressDto[];

  @ApiProperty({ type: [AdminCustomerOrderDto], description: 'Tối đa 20 đơn gần nhất' })
  recentOrders: AdminCustomerOrderDto[];
}
