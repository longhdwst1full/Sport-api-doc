import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, MaxLength, Min } from 'class-validator';
import { ENTITY_ID_OPENAPI } from '../../common/identifiers/entity-id';
import { ADDRESS_CODE_PROVIDERS, type AddressCodeProvider } from './admin-customer.dto';

export class CreateCustomerAddressDto {
  @ApiProperty({ example: 'Nguyễn Văn An', maxLength: 255 })
  @IsString()
  @Length(1, 255)
  recipient: string;

  @ApiProperty({ example: '0912345678', maxLength: 32 })
  @IsString()
  @Length(8, 32)
  phone: string;

  @ApiProperty({ example: '12 Nguyễn Trãi', maxLength: 500 })
  @IsString()
  @Length(1, 500)
  addressLine: string;

  @ApiPropertyOptional({ example: 'Phường Bến Thành', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  ward?: string;

  @ApiPropertyOptional({
    example: '21012',
    maxLength: 32,
    description: 'Mã phường/xã của hãng vận chuyển; thiếu thì địa chỉ không tạo được vận đơn.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  wardCode?: string;

  @ApiPropertyOptional({ example: 'Quận 1', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  district?: string;

  @ApiPropertyOptional({
    example: '1442',
    maxLength: 32,
    description: 'Mã quận/huyện của hãng vận chuyển; thiếu thì địa chỉ không tạo được vận đơn.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  districtCode?: string;

  @ApiPropertyOptional({ example: 'TP. Hồ Chí Minh', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  province?: string;

  @ApiProperty({ example: '79', maxLength: 32 })
  @IsString()
  @Length(1, 32)
  provinceCode: string;

  @ApiPropertyOptional({
    enum: ADDRESS_CODE_PROVIDERS,
    default: 'GHN',
    description: 'Hãng đã cấp bộ mã gửi kèm; bỏ trống thì hiểu là hãng mặc định của hệ thống.',
  })
  @IsOptional()
  @IsIn(ADDRESS_CODE_PROVIDERS)
  codeProvider?: AddressCodeProvider;

  @ApiPropertyOptional({ example: '700000', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateCustomerAddressDto extends PartialType(CreateCustomerAddressDto) {
  @ApiProperty({ minimum: 0, example: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion: number;
}

export class CustomerAddressDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) id: string;
  @ApiProperty() recipient: string;
  @ApiProperty() phone: string;
  @ApiProperty() addressLine: string;
  @ApiPropertyOptional({ type: String, nullable: true }) ward: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, example: '21012' }) wardCode: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) district: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, example: '1442' }) districtCode: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) province: string | null;
  @ApiProperty() provinceCode: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    enum: ADDRESS_CODE_PROVIDERS,
    description: 'Hãng đã cấp bộ mã địa giới của địa chỉ này.',
  })
  codeProvider: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) postalCode: string | null;
  @ApiProperty({ enum: ['VN'] }) countryCode: string;
  @ApiProperty() isDefault: boolean;
  @ApiProperty({ minimum: 0 }) version: number;
}
