import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class AuditQueryDto {
  @ApiPropertyOptional({ type: Number, default: 25, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit = 25;

  @ApiPropertyOptional({ description: 'Opaque cursor returned by the previous response' })
  @IsString()
  @IsOptional()
  cursor?: string;

  @ApiPropertyOptional({ maxLength: 150 }) @IsString() @MaxLength(150) @IsOptional() action?: string;
  @ApiPropertyOptional({ maxLength: 100 }) @IsString() @MaxLength(100) @IsOptional() entityType?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsUUID() @IsOptional() entityId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsUUID() @IsOptional() actorUserId?: string;
  @ApiPropertyOptional({ maxLength: 100 }) @IsString() @MaxLength(100) @IsOptional() requestId?: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsDateString() @IsOptional() from?: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsDateString() @IsOptional() to?: string;
}

export class AuditLogDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() requestId: string;
  @ApiProperty() sequenceNo: number;
  @ApiProperty() actorType: string;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true }) actorUserId?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) actorDisplayName?: string | null;
  @ApiProperty() action: string;
  @ApiProperty() entityType: string;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true }) entityId?: string | null;
  @ApiPropertyOptional({ type: Object, nullable: true }) before?: object | null;
  @ApiPropertyOptional({ type: Object, nullable: true }) after?: object | null;
  @ApiPropertyOptional({ type: String, nullable: true }) reason?: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}

export class AuditListDto {
  @ApiProperty({ type: [AuditLogDto] }) items: AuditLogDto[];
  @ApiPropertyOptional({ type: String, nullable: true }) nextCursor?: string | null;
}
