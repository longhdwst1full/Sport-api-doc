import { Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddressDto {
  @ApiProperty({ example: '123 Nguyễn Văn Linh' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  addressLine: string;

  @ApiProperty({ example: 'Quận 7' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  district: string;

  @ApiProperty({ example: 'TP. Hồ Chí Minh' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  province: string;
}

export class BranchDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'CN-HCM-01' }) code: string;
  @ApiProperty({ example: 'Chi nhánh Hồ Chí Minh' }) name: string;
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] }) status: 'ACTIVE' | 'INACTIVE';
  @ApiPropertyOptional({ example: '028 7300 8899' }) phone?: string;
  @ApiPropertyOptional({ example: 'hcm@dctd.vn' }) email?: string;
  @ApiProperty({ type: AddressDto }) address: AddressDto;
  @ApiProperty({ example: 'Asia/Ho_Chi_Minh' }) timezone: string;
  @ApiProperty({ example: 0 }) version: number;
}

export class WarehouseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) branchId: string;
  @ApiProperty({ example: 'KHO-HCM-01' }) code: string;
  @ApiProperty({ example: 'Kho bán hàng Hồ Chí Minh' }) name: string;
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] }) status: 'ACTIVE' | 'INACTIVE';
  @ApiProperty({ example: true }) isPrimary: boolean;
  @ApiProperty({ example: 0 }) version: number;
}

export class BranchListDto {
  @ApiProperty({ type: [BranchDto] }) items: BranchDto[];
  @ApiProperty({ example: 2 }) total: number;
}

export class WarehouseListDto {
  @ApiProperty({ type: [WarehouseDto] }) items: WarehouseDto[];
  @ApiProperty({ example: 2 }) total: number;
}

export class CreateWarehouseInputDto {
  @ApiProperty({ example: 'KHO-DN-01' })
  @IsString()
  @Matches(/^[A-Z0-9-]+$/)
  @MaxLength(32)
  code: string;

  @ApiProperty({ example: 'Kho bán hàng Đà Nẵng' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;
}

export class CreateBranchDto {
  @ApiProperty({ example: 'CN-DN-01' })
  @IsString()
  @Matches(/^[A-Z0-9-]+$/)
  @MaxLength(32)
  code: string;

  @ApiProperty({ example: 'Chi nhánh Đà Nẵng' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: '0236 7300 8899' })
  @IsPhoneNumber('VN')
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: 'danang@dctd.vn' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ type: AddressDto })
  @ValidateNested()
  @Type(() => AddressDto)
  address: AddressDto;

  @ApiProperty({ type: CreateWarehouseInputDto })
  @ValidateNested()
  @Type(() => CreateWarehouseInputDto)
  warehouse: CreateWarehouseInputDto;
}

export class BranchWithWarehouseDto {
  @ApiProperty({ type: BranchDto }) branch: BranchDto;
  @ApiProperty({ type: WarehouseDto }) warehouse: WarehouseDto;
}

export class UpdateWarehouseDto {
  @ApiProperty({ example: 'Kho bán hàng Đà Nẵng' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;
}

export class UpdateBranchWithWarehouseDto {
  @ApiProperty({ example: 'Chi nhánh Đà Nẵng' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: '0236 7300 8899' })
  @IsPhoneNumber('VN')
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: 'danang@dctd.vn' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ type: AddressDto })
  @ValidateNested()
  @Type(() => AddressDto)
  address: AddressDto;

  @ApiProperty({ type: UpdateWarehouseDto })
  @ValidateNested()
  @Type(() => UpdateWarehouseDto)
  warehouse: UpdateWarehouseDto;

  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) expectedVersion: number;
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) warehouseExpectedVersion: number;
}

export class ChangeBranchStatusDto {
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) expectedVersion: number;
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) warehouseExpectedVersion: number;
}
