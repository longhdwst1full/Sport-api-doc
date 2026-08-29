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
