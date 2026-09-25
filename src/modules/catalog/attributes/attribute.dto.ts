import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ENTITY_ID_OPENAPI } from '../../../common/identifiers/entity-id';
import {
  ATTRIBUTE_DATA_TYPE,
  ATTRIBUTE_LIMIT,
  ATTRIBUTE_STATUS,
  type AttributeDataType,
  type AttributeStatus,
} from './attribute.constants';

const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class AttributeOptionDto {
  @ApiProperty({ example: 'WHITE', description: 'Mã lựa chọn, bất biến khi đã có sản phẩm dùng' })
  @Transform(upper)
  @IsString()
  @Matches(ATTRIBUTE_LIMIT.OPTION_CODE_PATTERN)
  code: string;

  @ApiProperty({ example: 'Trắng' }) @Transform(trim) @IsString() @MinLength(1) @MaxLength(255) label: string;

  @ApiPropertyOptional({ type: String, example: '#FFFFFF', nullable: true })
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  @IsOptional()
  colorHex?: string | null;
}

export class AttributeDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) id: string;
  @ApiProperty({ example: 'ADJUSTABLE_HEIGHT' }) code: string;
  @ApiProperty({ example: 'Chiều cao điều chỉnh' }) name: string;
  @ApiProperty({ enum: Object.values(ATTRIBUTE_DATA_TYPE), enumName: 'AttributeDataType' }) dataType: AttributeDataType;
  @ApiPropertyOptional({ type: String, example: 'm', nullable: true }) unit: string | null;
  @ApiProperty({ description: 'Có thể dùng làm trục biến thể (Option) — chưa dùng ở V1' }) isVariantAxis: boolean;
  @ApiProperty({ type: [AttributeOptionDto], description: 'Chỉ với OPTION; rỗng với kiểu khác' }) options: AttributeOptionDto[];
  @ApiProperty({ enum: Object.values(ATTRIBUTE_STATUS), enumName: 'AttributeStatus' }) status: AttributeStatus;
  @ApiProperty() sortOrder: number;
  @ApiProperty({ minimum: 0 }) version: number;
}

export class AttributeListDto {
  @ApiProperty({ type: [AttributeDto] }) items: AttributeDto[];
}

export class CreateAttributeDto {
  @ApiProperty({ example: 'ADJUSTABLE_HEIGHT', description: 'Chữ hoa, số, gạch dưới; bất biến sau khi tạo' })
  @Transform(upper)
  @IsString()
  @Matches(ATTRIBUTE_LIMIT.CODE_PATTERN, { message: 'Mã thuộc tính chỉ gồm A-Z, 0-9, _ và bắt đầu bằng chữ' })
  code: string;

  @ApiProperty({ example: 'Chiều cao điều chỉnh' }) @Transform(trim) @IsString() @MinLength(1) @MaxLength(255) name: string;

  @ApiProperty({ enum: Object.values(ATTRIBUTE_DATA_TYPE), enumName: 'AttributeDataType' })
  @IsIn(Object.values(ATTRIBUTE_DATA_TYPE))
  dataType: AttributeDataType;

  @ApiPropertyOptional({ example: 'm', maxLength: 16 }) @Transform(trim) @IsString() @MaxLength(16) @IsOptional() unit?: string;

  @ApiPropertyOptional({ default: false }) @IsBoolean() @IsOptional() isVariantAxis?: boolean;

  @ApiPropertyOptional({ type: [AttributeOptionDto], description: 'Bắt buộc (≥1) với OPTION, bỏ trống với kiểu khác' })
  @IsArray()
  @ArrayMaxSize(ATTRIBUTE_LIMIT.MAX_OPTIONS)
  @ValidateNested({ each: true })
  @Type(() => AttributeOptionDto)
  @IsOptional()
  options?: AttributeOptionDto[];

  @ApiPropertyOptional({ default: 0 }) @IsInt() @Min(0) @IsOptional() sortOrder?: number;
}

/** CONTRACT: không nhận `code` và `dataType` — thông số của sản phẩm tham chiếu theo code và kiểu đó. */
export class UpdateAttributeDto {
  @ApiPropertyOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(255) @IsOptional() name?: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Không đổi được khi thuộc tính NUMBER đã có sản phẩm dùng' })
  @Transform(trim) @IsString() @MaxLength(16) @IsOptional() unit?: string | null;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isVariantAxis?: boolean;
  @ApiPropertyOptional({ type: [AttributeOptionDto], description: 'Danh sách đầy đủ; không được bỏ lựa chọn đang có sản phẩm dùng' })
  @IsArray()
  @ArrayMaxSize(ATTRIBUTE_LIMIT.MAX_OPTIONS)
  @ValidateNested({ each: true })
  @Type(() => AttributeOptionDto)
  @IsOptional()
  options?: AttributeOptionDto[];
  @ApiPropertyOptional({ enum: Object.values(ATTRIBUTE_STATUS), enumName: 'AttributeStatus', description: 'Ngừng dùng thay cho xoá' })
  @IsIn(Object.values(ATTRIBUTE_STATUS))
  @IsOptional()
  status?: AttributeStatus;
  @ApiPropertyOptional() @IsInt() @Min(0) @IsOptional() sortOrder?: number;
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) expectedVersion: number;
}

/** Giá trị thô trong `products.specifications`: chỉ mã thuộc tính và giá trị, không nhãn/đơn vị. */
export class ProductSpecificationInputDto {
  @ApiProperty({ example: 'ADJUSTABLE_HEIGHT' }) @Transform(upper) @IsString() @MaxLength(64) code: string;

  @ApiProperty({
    type: 'array',
    items: { oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }] },
    example: [1.55, 2.25, 2.44],
    description: 'TEXT: chuỗi; NUMBER: số (đơn vị lấy từ thuộc tính); BOOLEAN: một giá trị; OPTION: mã lựa chọn',
  })
  @IsArray()
  @ArrayMaxSize(ATTRIBUTE_LIMIT.MAX_VALUES_PER_ATTRIBUTE)
  values: Array<string | number | boolean>;
}

export class ReplaceProductSpecificationsDto {
  @ApiProperty({ type: [ProductSpecificationInputDto] })
  @IsArray()
  @ArrayMaxSize(ATTRIBUTE_LIMIT.MAX_SPECIFICATIONS_PER_PRODUCT)
  @ValidateNested({ each: true })
  @Type(() => ProductSpecificationInputDto)
  specifications: ProductSpecificationInputDto[];

  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) expectedVersion: number;
}

export class ProductSpecificationValueDto {
  @ApiProperty({ oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }] }) value: string | number | boolean;
  @ApiProperty({ example: '2.25 m', description: 'Nhãn hiển thị đã ghép đơn vị / nhãn lựa chọn' }) label: string;
}

/** Thông số đã ghép nhãn/đơn vị từ từ điển để FE render thẳng. */
export class ProductSpecificationDto {
  @ApiProperty({ example: 'ADJUSTABLE_HEIGHT' }) code: string;
  @ApiProperty({ example: 'Chiều cao điều chỉnh' }) name: string;
  @ApiProperty({ enum: Object.values(ATTRIBUTE_DATA_TYPE), enumName: 'AttributeDataType' }) dataType: AttributeDataType;
  @ApiPropertyOptional({ type: String, nullable: true }) unit: string | null;
  @ApiProperty({ type: [ProductSpecificationValueDto] }) values: ProductSpecificationValueDto[];
}
