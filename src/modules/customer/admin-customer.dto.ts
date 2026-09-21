import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ENTITY_ID_OPENAPI, ENTITY_ID_PATTERN } from '../../common/identifiers/entity-id';

/** Một hồ sơ khách không giữ quá số địa chỉ này; nhiều hơn là dấu hiệu nhập nhầm, không phải nhu cầu thật. */
export const CUSTOMER_ADDRESS_LIMIT = 10;

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

  @ApiProperty({
    ...ENTITY_ID_OPENAPI,
    nullable: true,
    description: 'Media asset dùng làm ảnh đại diện; null nếu chưa có ảnh',
  })
  avatarAssetId: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'URL ảnh đại diện lấy từ media asset, chỉ để hiển thị',
  })
  avatarUrl: string | null;

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

  @ApiProperty({
    example: 3,
    description: 'Gửi lại làm expectedVersion khi sửa, ngừng hoạt động hoặc xoá',
  })
  version: number;
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

/**
 * Địa chỉ gửi kèm khi tạo/sửa khách.
 *
 * CONTRACT: danh sách gửi lên là trạng thái mong muốn cuối cùng. Địa chỉ có `id` là địa chỉ cũ được
 * giữ lại (và cập nhật), địa chỉ không có `id` là địa chỉ mới, địa chỉ cũ không xuất hiện trong danh
 * sách sẽ bị ngừng sử dụng. Bỏ trống trường `addresses` nghĩa là không đụng tới địa chỉ.
 */
export class AdminCustomerAddressInputDto {
  @ApiPropertyOptional({
    ...ENTITY_ID_OPENAPI,
    description: 'Có id là sửa địa chỉ đang có; bỏ trống là thêm mới',
  })
  @IsOptional() @IsString() @Matches(ENTITY_ID_PATTERN, { message: 'Mã địa chỉ không hợp lệ' })
  id?: string;

  @ApiProperty({ example: 'Nguyễn Văn An', maxLength: 255 })
  @IsString() @Length(1, 255)
  recipient: string;

  @ApiProperty({ example: '0912345678', maxLength: 32 })
  @IsString() @Length(8, 32)
  phone: string;

  @ApiProperty({ example: '12 Nguyễn Trãi', maxLength: 500 })
  @IsString() @Length(1, 500)
  addressLine: string;

  @ApiPropertyOptional({ example: 'Phường Bến Thành', maxLength: 255 })
  @IsOptional() @IsString() @MaxLength(255)
  ward?: string;

  @ApiPropertyOptional({ example: 'Quận 1', maxLength: 255 })
  @IsOptional() @IsString() @MaxLength(255)
  district?: string;

  @ApiProperty({ example: '79', maxLength: 32, description: 'Mã tỉnh/thành theo danh mục hãng vận chuyển' })
  @IsString() @Length(1, 32)
  provinceCode: string;

  @ApiPropertyOptional({ default: false, description: 'Đúng một địa chỉ mặc định cho mỗi khách' })
  @IsOptional() @IsBoolean()
  isDefault?: boolean;
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

export class CreateAdminCustomerDto {
  @ApiProperty({ example: 'Nguyễn Minh Anh', maxLength: 255 })
  @IsString() @MaxLength(255)
  name: string;

  @ApiProperty({
    example: '0912345678',
    maxLength: 32,
    description: 'Bắt buộc: hồ sơ khách phải có cả SĐT và email để nhận lại khách và gửi thông báo đơn.',
  })
  @IsString() @Length(8, 32)
  phone: string;

  @ApiProperty({ example: 'minh.anh@example.com', maxLength: 255 })
  @IsEmail({}, { message: 'Email không hợp lệ' }) @MaxLength(255)
  email: string;

  @ApiPropertyOptional({ default: false, description: 'Khách đồng ý nhận tin khuyến mãi' })
  @IsOptional() @IsBoolean()
  marketingConsent?: boolean;

  @ApiPropertyOptional({
    ...ENTITY_ID_OPENAPI,
    description: 'Media asset đã upload dùng làm ảnh đại diện',
  })
  @IsOptional() @IsString() @Matches(ENTITY_ID_PATTERN, { message: 'Mã ảnh không hợp lệ' })
  avatarAssetId?: string;

  @ApiPropertyOptional({ type: [AdminCustomerAddressInputDto], maxItems: CUSTOMER_ADDRESS_LIMIT })
  @IsOptional() @IsArray() @ArrayMaxSize(CUSTOMER_ADDRESS_LIMIT)
  @ValidateNested({ each: true }) @Type(() => AdminCustomerAddressInputDto)
  addresses?: AdminCustomerAddressInputDto[];
}

export class UpdateAdminCustomerDto {
  @ApiProperty({ minimum: 0, description: 'Version khách hàng mà Admin đang xem' })
  @Type(() => Number) @IsInt() @Min(0)
  expectedVersion: number;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional() @IsString() @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    maxLength: 32,
    description: 'SĐT là bắt buộc trên hồ sơ, nên gửi giá trị mới chứ không gửi chuỗi rỗng để xoá.',
  })
  @IsOptional() @IsString() @Length(8, 32)
  phone?: string;

  @ApiPropertyOptional({
    maxLength: 255,
    description: 'Email là bắt buộc trên hồ sơ, nên gửi giá trị mới chứ không gửi chuỗi rỗng để xoá.',
  })
  @IsOptional() @IsEmail({}, { message: 'Email không hợp lệ' }) @MaxLength(255)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  marketingConsent?: boolean;

  @ApiPropertyOptional({
    ...ENTITY_ID_OPENAPI,
    nullable: true,
    description: 'Gửi null để gỡ ảnh đại diện; bỏ trống để giữ nguyên',
  })
  @IsOptional() @ValidateIf((_object, value) => value !== null)
  @IsString() @Matches(ENTITY_ID_PATTERN, { message: 'Mã ảnh không hợp lệ' })
  avatarAssetId?: string | null;

  @ApiPropertyOptional({
    type: [AdminCustomerAddressInputDto],
    maxItems: CUSTOMER_ADDRESS_LIMIT,
    description: 'Trạng thái địa chỉ mong muốn sau khi lưu; bỏ trống để không đụng tới địa chỉ',
  })
  @IsOptional() @IsArray() @ArrayMaxSize(CUSTOMER_ADDRESS_LIMIT)
  @ValidateNested({ each: true }) @Type(() => AdminCustomerAddressInputDto)
  addresses?: AdminCustomerAddressInputDto[];
}

export class CustomerStatusCommandDto {
  @ApiProperty({ minimum: 0, description: 'Version khách hàng mà Admin đang xem' })
  @Type(() => Number) @IsInt() @Min(0)
  expectedVersion: number;

  @ApiPropertyOptional({ maxLength: 500, description: 'Lý do, lưu lại để truy vết' })
  @IsOptional() @IsString() @MaxLength(500)
  reason?: string;
}
