import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ENTITY_ID_OPENAPI, IsEntityId } from '../../../common/identifiers/entity-id';

/** Bán tại quầy thu tiền ngay; không có COD vì khách cầm hàng về luôn. */
export const POS_PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER'] as const;
export type PosPaymentMethod = (typeof POS_PAYMENT_METHODS)[number];

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
