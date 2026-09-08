import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Length, MaxLength, Min } from 'class-validator';
import { ENTITY_ID_OPENAPI } from '../../common/identifiers/entity-id';

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

  @ApiPropertyOptional({ example: 'Quận 1', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  district?: string;

  @ApiProperty({ example: '79', maxLength: 32 })
  @IsString()
  @Length(1, 32)
  provinceCode: string;

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
  @ApiPropertyOptional({ nullable: true }) ward: string | null;
  @ApiPropertyOptional({ nullable: true }) district: string | null;
  @ApiProperty() provinceCode: string;
  @ApiPropertyOptional({ nullable: true }) postalCode: string | null;
  @ApiProperty({ enum: ['VN'] }) countryCode: string;
  @ApiProperty() isDefault: boolean;
  @ApiProperty({ minimum: 0 }) version: number;
}
