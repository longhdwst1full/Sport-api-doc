import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ example: 'ok' }) status: string;
  @ApiProperty({ example: 'dctd-api' }) service: string;
  @ApiProperty({ example: '0.1.0' }) version: string;
  @ApiProperty({ format: 'date-time' }) timestamp: string;
}
