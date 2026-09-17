import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ENTITY_ID_OPENAPI, IsEntityId } from '../../../common/identifiers/entity-id';

/**
 * Cách thu tiền cho đơn do nhân viên lập.
 *
 * CASH và BANK_TRANSFER là thu ngay tại quầy. COD chỉ dùng cho đơn có giao hàng: tiền thu khi
 * giao, nên đơn được tạo ở trạng thái chờ thanh toán chứ không ghi nhận đã thu.
 */
export const POS_PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'COD'] as const;
export type PosPaymentMethod = (typeof POS_PAYMENT_METHODS)[number];

/** Địa chỉ giao cho đơn nhân viên lập hộ khách; bỏ trống nghĩa là khách nhận ngay tại quầy. */
export class PosDeliveryAddressDto {
  @ApiProperty({ example: 'Nguyễn Văn An', maxLength: 255 })
  @IsString() @IsNotEmpty() @MaxLength(255)
  recipient: string;

  @ApiProperty({ example: '0901234567' })
  @IsString()
  @Matches(/^0\d{8,10}$/, { message: 'Số điện thoại phải bắt đầu bằng 0 và có 9-11 chữ số' })
  phone: string;

  @ApiProperty({ example: '12 Nguyễn Trãi', maxLength: 500 })
  @IsString() @IsNotEmpty() @MaxLength(500)
  addressLine: string;

  @ApiProperty({ example: 'Hà Nội', maxLength: 255 })
  @IsString() @IsNotEmpty() @MaxLength(255)
  province: string;

  @ApiProperty({ example: '201', maxLength: 32, description: 'Mã tỉnh/thành của hãng vận chuyển' })
  @IsString() @IsNotEmpty() @MaxLength(32)
  provinceCode: string;

  @ApiPropertyOptional({ example: 'Ba Đình', maxLength: 255 })
  @IsOptional() @IsString() @MaxLength(255)
  district?: string;

  @ApiPropertyOptional({ example: '1442', maxLength: 32 })
  @IsOptional() @IsString() @MaxLength(32)
  districtCode?: string;

  @ApiPropertyOptional({ example: 'Phúc Xá', maxLength: 255 })
  @IsOptional() @IsString() @MaxLength(255)
  ward?: string;

  @ApiPropertyOptional({ example: '21012', maxLength: 32 })
  @IsOptional() @IsString() @MaxLength(32)
  wardCode?: string;
}

export class PosCustomerDto {
  @ApiProperty({ example: 'Nguyễn Văn An', maxLength: 255 })
  @IsString() @IsNotEmpty() @MaxLength(255)
  name: string;

  @ApiProperty({
    example: '0901234567',
    description: 'Dùng để tìm lại khách cũ và tra cứu bảo hành sau này',
  })
  @IsString()
  @Matches(/^0\d{8,10}$/, { message: 'Số điện thoại phải bắt đầu bằng 0 và có 9-11 chữ số' })
  phone: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional() @IsEmail() @MaxLength(255)
  email?: string;
}

export class PosOrderItemDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI })
  @IsEntityId()
  productVariantId: string;

  @ApiProperty({ minimum: 1, example: 1 })
  @Type(() => Number) @IsInt() @Min(1)
  quantity: number;
}

export class CreatePosOrderDto {
  @ApiProperty({ type: PosCustomerDto })
  @ValidateNested() @Type(() => PosCustomerDto)
  customer: PosCustomerDto;

  @ApiProperty({ type: [PosOrderItemDto] })
  @IsArray() @ArrayNotEmpty() @ArrayMaxSize(100)
  @ValidateNested({ each: true }) @Type(() => PosOrderItemDto)
  items: PosOrderItemDto[];

  @ApiProperty({ enum: POS_PAYMENT_METHODS, example: 'CASH' })
  @IsIn(POS_PAYMENT_METHODS)
  paymentMethod: PosPaymentMethod;

  @ApiPropertyOptional({
    type: PosDeliveryAddressDto,
    description:
      'Bỏ trống: khách nhận ngay tại quầy như cũ. Có giá trị: đơn đi giao hàng, tồn kho vẫn đặt '
      + 'chỗ như luồng checkout của khách.',
  })
  @IsOptional() @ValidateNested() @Type(() => PosDeliveryAddressDto)
  delivery?: PosDeliveryAddressDto;

  @ApiPropertyOptional({
    description:
      'Chạy luôn hết vòng giao hàng và đánh dấu đã giao. Mặc định bật cho đơn tại quầy và tắt '
      + 'cho đơn giao hàng; bật cho đơn giao hàng khi khách lấy ngay tại cửa hàng.',
  })
  @IsOptional() @IsBoolean()
  handOverImmediately?: boolean;

  @ApiPropertyOptional({
    maxLength: 1000,
    description: 'Ghi chú tại quầy; lưu kèm đơn để truy vết về sau',
  })
  @IsOptional() @IsString() @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({
    ...ENTITY_ID_OPENAPI,
    description:
      'Chi nhánh bán. BẮT BUỘC với tài khoản phạm vi toàn hệ thống vì họ không gắn '
      + 'chi nhánh nào. Tài khoản thuộc một chi nhánh thì bỏ trống, hoặc truyền đúng '
      + 'chi nhánh của mình.',
  })
  @IsOptional() @IsEntityId()
  branchId?: string;
}

export class PosCatalogQueryDto {
  @ApiPropertyOptional({ maxLength: 100, description: 'Tìm theo SKU hoặc tên sản phẩm' })
  @IsOptional() @IsString() @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50)
  limit: number = 20;

  @ApiPropertyOptional({
    ...ENTITY_ID_OPENAPI,
    description: 'Chi nhánh bán, cùng quy tắc với tạo đơn tại quầy. Quyết định kho tính tồn.',
  })
  @IsOptional() @IsEntityId()
  branchId?: string;
}

export class PosCatalogComponentDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) productVariantId: string;
  @ApiProperty({ example: 'HQ-909S' }) sku: string;
  @ApiProperty({ example: 'Giàn tạ đa năng HQ-909S' }) name: string;
  @ApiProperty({ example: 2, description: 'Số lượng thành phần trong một combo' })
  quantity: number;
}

export class PosCatalogItemDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) id: string;
  @ApiProperty({ example: 'HQ-909S' }) sku: string;
  @ApiProperty({ example: 'Giàn tạ đa năng HQ-909S' }) name: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '16000000.00',
    description: 'Giá bán hiện hành; null nghĩa là chưa có bảng giá hiệu lực, chưa bán được',
  })
  unitPrice: string | null;

  @ApiProperty({ example: false, description: 'Combo bán nguyên cụm, không tách lẻ' })
  isBundle: boolean;

  @ApiProperty({
    type: [PosCatalogComponentDto],
    description: 'Thành phần của combo; rỗng với hàng lẻ',
  })
  components: PosCatalogComponentDto[];

  @ApiProperty({
    example: 3,
    description:
      'Tồn khả dụng tại kho của chi nhánh bán (đã trừ hàng đang giữ). Combo lấy theo thành '
      + 'phần thiếu nhất vì combo không có tồn riêng.',
  })
  availableQuantity: number;
}

export class PosCatalogResponseDto {
  @ApiProperty({ type: [PosCatalogItemDto] }) items: PosCatalogItemDto[];
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 20 }) limit: number;
  @ApiProperty({ example: 42 }) total: number;
  @ApiProperty({ example: true }) hasMore: boolean;
  @ApiProperty({ ...ENTITY_ID_OPENAPI, description: 'Chi nhánh đã dùng để tính tồn' })
  branchId: string;
}
