import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ENTITY_ID_OPENAPI } from '../../../common/identifiers/entity-id';
import { SYSTEM_PARAMETER_GROUP, SYSTEM_PARAMETER_VALUE_TYPE } from './system-parameter.catalog';

const trimOptional = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class SystemParameterDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) id: string;
  @ApiProperty({ description: 'Mã ổn định dùng trong code; không đổi được từ giao diện' }) code: string;
  @ApiProperty({ enum: Object.values(SYSTEM_PARAMETER_GROUP) }) groupCode: string;
  @ApiProperty() label: string;
  @ApiPropertyOptional({ type: String, nullable: true }) description: string | null;
  @ApiProperty({ enum: Object.values(SYSTEM_PARAMETER_VALUE_TYPE) }) valueType: string;
  @ApiProperty({ description: 'Giá trị đang áp dụng, luôn ở dạng chuỗi' }) value: string;
  @ApiProperty({ description: 'Giá trị mặc định khi chưa cấu hình hoặc giá trị hỏng' }) defaultValue: string;
  @ApiPropertyOptional({ type: Number, nullable: true }) minValue: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) maxValue: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) unit: string | null;
  @ApiProperty() status: string;
  @ApiProperty({ description: 'Storefront được phép đọc tham số này qua API công khai' }) isPublic: boolean;
  @ApiProperty({ description: 'Tham số hệ thống: code đang đọc theo mã, chỉ sửa được giá trị' })
  isSystem: boolean;

  @ApiProperty({
    description:
      'Bí mật nhà cung cấp: giá trị không đọc lại được qua API, chỉ ghi đè. Trường value trả về '
      + 'dấu che nếu đã cấu hình và chuỗi rỗng nếu chưa.',
  })
  isSecret: boolean;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Ghi chú của lần sửa gần nhất' })
  remarks: string | null;
  @ApiProperty() version: string;
  @ApiProperty({ format: 'date-time' }) updatedAt: string;
  @ApiPropertyOptional({ ...ENTITY_ID_OPENAPI, nullable: true }) updatedBy: string | null;
}

export class SystemParameterListDto {
  @ApiProperty({ type: [SystemParameterDto] }) items: SystemParameterDto[];
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() total: number;
}

export const PARAMETER_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;

/** Trường được phép sắp xếp; whitelist để `sort` không thành chỗ tiêm truy vấn. */
export const SYSTEM_PARAMETER_SORT_FIELD = {
  id: 'id',
  code: 'code',
  groupCode: 'groupCode',
  sortOrder: 'sortOrder',
  updatedAt: 'updatedAt',
} as const;

export class SystemParameterQueryDto {
  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1 })
  @Type(() => Number) @IsInt() @Min(1) @IsOptional() page = 1;

  @ApiPropertyOptional({ type: Number, default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional() limit = 20;

  @ApiPropertyOptional({ enum: Object.values(SYSTEM_PARAMETER_GROUP) })
  @IsIn(Object.values(SYSTEM_PARAMETER_GROUP)) @IsOptional() groupCode?: string;

  @ApiPropertyOptional({ maxLength: 100, description: 'Tìm theo mã hoặc nhãn tham số' })
  @Transform(trimOptional) @IsString() @MaxLength(100) @IsOptional() search?: string;

  @ApiPropertyOptional({ enum: Object.values(PARAMETER_STATUS) })
  @IsIn(Object.values(PARAMETER_STATUS)) @IsOptional() status?: string;

  @ApiPropertyOptional({ description: 'Chỉ lấy tham số hệ thống hoặc tham số tuỳ biến' })
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  @IsBoolean() @IsOptional() isSystem?: boolean;

  @ApiPropertyOptional({
    enum: Object.values(SYSTEM_PARAMETER_SORT_FIELD),
    default: 'sortOrder',
    description: 'Trường sắp xếp; kèm `sortDirection` để đổi chiều',
  })
  @IsIn(Object.values(SYSTEM_PARAMETER_SORT_FIELD)) @IsOptional() sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsIn(['asc', 'desc']) @IsOptional() sortDirection?: 'asc' | 'desc';
}

export class CreateSystemParameterDto {
  @ApiProperty({ pattern: '^[A-Z][A-Z0-9_]*$', maxLength: 64, description: 'Mã viết hoa, dùng gạch dưới' })
  @Transform(trimOptional) @IsString() @Matches(/^[A-Z][A-Z0-9_]*$/) @MaxLength(64) code: string;

  @ApiProperty({ enum: Object.values(SYSTEM_PARAMETER_GROUP) })
  @IsIn(Object.values(SYSTEM_PARAMETER_GROUP)) groupCode: string;

  @ApiProperty({ maxLength: 255 })
  @Transform(trimOptional) @IsString() @MinLength(1) @MaxLength(255) label: string;

  @ApiPropertyOptional()
  @Transform(trimOptional) @IsString() @IsOptional() description?: string;

  @ApiProperty({ enum: Object.values(SYSTEM_PARAMETER_VALUE_TYPE) })
  @IsIn(Object.values(SYSTEM_PARAMETER_VALUE_TYPE)) valueType: string;

  @ApiProperty({ maxLength: 500 })
  @Transform(trimOptional) @IsString() @MaxLength(500) value: string;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsNumber() @IsOptional() minValue?: number;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsNumber() @IsOptional() maxValue?: number;

  @ApiPropertyOptional({ maxLength: 32 })
  @Transform(trimOptional) @IsString() @MaxLength(32) @IsOptional() unit?: string;

  @ApiPropertyOptional({ default: false, description: 'Cho phép Storefront đọc qua API công khai' })
  @IsBoolean() @IsOptional() isPublic?: boolean;

  @ApiPropertyOptional({ maxLength: 500 })
  @Transform(trimOptional) @IsString() @MaxLength(500) @IsOptional() remarks?: string;
}

export class DeleteSystemParameterDto {
  @ApiProperty({ type: String, pattern: '^\\d+$' })
  @IsString() expectedVersion: string;

  @ApiPropertyOptional({ minLength: 5, maxLength: 500, description: 'Lý do nếu người thao tác muốn ghi thêm vào audit' })
  @Transform(trimOptional) @IsString() @MinLength(5) @MaxLength(500) @IsOptional() reason?: string;
}

export class UpdateSystemParameterDto {
  @ApiProperty({ type: String, pattern: '^\\d+$' })
  @IsString() expectedVersion: string;

  @ApiProperty({ description: 'Giá trị mới ở dạng chuỗi; server kiểm tra kiểu và khoảng hợp lệ' })
  @Transform(trimOptional) @IsString() @MaxLength(500) value: string;

  @ApiPropertyOptional({ minLength: 5, maxLength: 500, description: 'Lý do thay đổi (không bắt buộc); actor/time/value vẫn được audit' })
  @Transform(trimOptional) @IsString() @MinLength(5) @MaxLength(500) @IsOptional() reason?: string;
}
