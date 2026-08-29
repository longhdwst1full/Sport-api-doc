import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({ example: 400 }) statusCode: number;
  @ApiProperty({ example: 'VALIDATION_ERROR' }) code: string;
  @ApiProperty({ example: 'Request validation failed' }) message: string;
  @ApiPropertyOptional({ type: Object }) details?: unknown;
  @ApiProperty({ example: '/api/v1/catalog/products' }) path: string;
  @ApiProperty({ format: 'date-time' }) timestamp: string;
  @ApiPropertyOptional() requestId?: string;
}
