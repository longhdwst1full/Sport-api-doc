import { ApiProperty } from '@nestjs/swagger';

export class DatabaseHealthDto {
  @ApiProperty() enabled: boolean;
  @ApiProperty({ enum: ['up', 'down', 'disabled'] }) status: 'up' | 'down' | 'disabled';
}

export class HealthResponseDto {
  @ApiProperty({ enum: ['ok', 'degraded'], example: 'ok' }) status: 'ok' | 'degraded';
  @ApiProperty({ example: 'dctd-api' }) service: string;
  @ApiProperty({ example: '0.1.0' }) version: string;
  @ApiProperty({ format: 'date-time' }) timestamp: string;
  @ApiProperty({ type: DatabaseHealthDto }) database: DatabaseHealthDto;
}

/** Trạng thái cấu hình của một năng lực tích hợp. */
export const CAPABILITY_READINESS_STATUSES = [
  'READY',
  'DISABLED',
  'MISCONFIGURED',
  'UNKNOWN',
] as const;

export class CapabilityReadinessDto {
  @ApiProperty({ example: 'SHIPPING_GHN' }) name: string;

  @ApiProperty({ description: 'Năng lực có đang được bật hay không' }) enabled: boolean;

  @ApiProperty({
    enum: CAPABILITY_READINESS_STATUSES, enumName: 'CapabilityReadinessStatus',
    description:
      'READY: đủ tham số. DISABLED: cố tình tắt, không phải lỗi. MISCONFIGURED: đang bật nhưng '
      + 'thiếu tham số — đây là thứ cần sửa. UNKNOWN: chưa đọc được tham số để kết luận.',
  })
  status: (typeof CAPABILITY_READINESS_STATUSES)[number];

  @ApiProperty({
    type: [String],
    example: ['GHN_TOKEN'],
    description: 'TÊN tham số còn thiếu. Không bao giờ chứa giá trị tham số.',
  })
  missing: string[];
}

export class ConfigReadinessDto {
  @ApiProperty({ enum: ['ok', 'degraded'] }) status: 'ok' | 'degraded';
  @ApiProperty({ type: [CapabilityReadinessDto] }) capabilities: CapabilityReadinessDto[];
  @ApiProperty({ format: 'date-time' }) timestamp: string;
}

