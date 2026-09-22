import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, Length, MaxLength, Min } from 'class-validator';
import { ENTITY_ID_OPENAPI } from '../../common/identifiers/entity-id';

export class CustomerProfileDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) id: string;

  @ApiProperty({ example: 'KH-000128', description: 'Mã khách, dùng khi liên hệ hỗ trợ' })
  customerNo: string;

  @ApiProperty({ example: 'Nguyễn Minh Anh' }) name: string;

  @ApiProperty({ type: String, nullable: true, example: 'minhanh@example.com' })
  email: string | null;

  @ApiProperty({ type: String, nullable: true, example: '0903456789' })
  phone: string | null;

  @ApiProperty({ description: 'Khách có đồng ý nhận tin khuyến mãi' })
  marketingConsent: boolean;

  @ApiProperty({ description: 'Thời điểm tạo tài khoản' }) createdAt: string;

  @ApiProperty({
    example: 3,
    description: 'Gửi lại làm expectedVersion khi cập nhật hồ sơ',
  })
  version: number;
}

/**
 * Khách tự sửa hồ sơ của chính mình.
 *
 * CONTRACT: email và số điện thoại ở đây **cũng là định danh đăng nhập**. V1 chưa có xác thực email
 * hay OTP, nên đổi email là đổi luôn tài khoản dùng để đăng nhập, có hiệu lực ngay. Đây là giới hạn
 * đã biết, ghi trong `src/modules/customer/README.md`; khi có xác thực thì tách thành luồng riêng
 * có bước xác nhận chứ không sửa thẳng như hiện tại.
 */
export class UpdateCustomerProfileDto {
  @ApiProperty({ minimum: 0, description: 'Version hồ sơ mà khách đang xem' })
  @Type(() => Number) @IsInt() @Min(0)
  expectedVersion: number;

  @ApiPropertyOptional({ example: 'Nguyễn Minh Anh', maxLength: 255 })
  @IsOptional() @IsString() @Length(1, 255)
  name?: string;

  @ApiPropertyOptional({
    example: '0903456789',
    maxLength: 32,
    description: 'Cũng là định danh đăng nhập; đổi xong phải dùng số mới để đăng nhập.',
  })
  @IsOptional() @IsString() @Length(8, 32)
  phone?: string;

  @ApiPropertyOptional({
    example: 'minhanh@example.com',
    maxLength: 255,
    description: 'Cũng là định danh đăng nhập; đổi xong phải dùng email mới để đăng nhập.',
  })
  @IsOptional() @IsEmail({}, { message: 'Email không hợp lệ' }) @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ description: 'Khách có đồng ý nhận tin khuyến mãi' })
  @IsOptional() @IsBoolean()
  marketingConsent?: boolean;
}
