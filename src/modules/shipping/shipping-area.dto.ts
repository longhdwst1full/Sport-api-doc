import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ShippingAreaDto {
  @ApiProperty({
    example: '1442',
    description: 'Mã địa giới của hãng vận chuyển; lưu vào districtCode/wardCode của địa chỉ',
  })
  code: string;

  @ApiProperty({ example: 'Quận Ba Đình' })
  name: string;
}

export class ShippingAreaListDto {
  @ApiProperty({ type: [ShippingAreaDto] })
  items: ShippingAreaDto[];
}

export class DistrictQueryDto {
  @ApiProperty({ example: '201', description: 'Mã tỉnh/thành do endpoint provinces trả về' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  provinceCode: string;
}

export class WardQueryDto {
  @ApiProperty({ example: '1442', description: 'Mã quận/huyện do endpoint districts trả về' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  districtCode: string;
}
