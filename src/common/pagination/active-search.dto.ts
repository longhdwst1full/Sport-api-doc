import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class ActiveSearchQueryDto {
  @ApiPropertyOptional({ description: 'Search by business code or display label', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page = 1;

  @ApiPropertyOptional({ type: Number, default: 20, minimum: 1, maximum: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  limit = 20;
}

export class ActiveWarehouseSearchQueryDto extends ActiveSearchQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Restrict lookup to one branch' })
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

export class ActiveLookupOptionDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'CN-HCM-01' }) code: string;
  @ApiProperty({ example: 'Chi nhánh Hồ Chí Minh' }) label: string;
}

export class ActiveLookupMetaDto {
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 20 }) limit: number;
  @ApiProperty({ example: 1 }) total: number;
  @ApiProperty({ example: false }) hasMore: boolean;
}

export class ActiveLookupResponseDto {
  @ApiProperty({ type: [ActiveLookupOptionDto] }) items: ActiveLookupOptionDto[];
  @ApiProperty({ type: ActiveLookupMetaDto }) meta: ActiveLookupMetaDto;
}

export function buildActiveLookupResponse(
  items: ActiveLookupOptionDto[],
  query: ActiveSearchQueryDto,
): ActiveLookupResponseDto {
  const search = query.search?.trim().toLocaleLowerCase('vi') ?? '';
  const filtered = items
    .filter((item) => {
      if (!search) return true;
      return `${item.code} ${item.label}`.toLocaleLowerCase('vi').includes(search);
    })
    .sort((left, right) => left.code.localeCompare(right.code));
  const offset = (query.page - 1) * query.limit;

  return {
    items: filtered.slice(offset, offset + query.limit),
    meta: {
      page: query.page,
      limit: query.limit,
      total: filtered.length,
      hasMore: offset + query.limit < filtered.length,
    },
  };
}
