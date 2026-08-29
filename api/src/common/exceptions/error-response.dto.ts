import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ErrorDetailDto {
  @ApiPropertyOptional({ example: 'name' }) field?: string;
  @ApiProperty({ example: 'INVALID_VALUE' }) code: string;
  @ApiProperty({ example: 'name should not be empty' }) message: string;
}

export class ErrorResponseDto {
  @ApiProperty({ example: 400 }) statusCode: number;
  @ApiProperty({ example: 'VALIDATION_ERROR' }) code: string;
  @ApiProperty({ example: 'Request validation failed' }) message: string;
  @ApiPropertyOptional({ type: [ErrorDetailDto] }) details?: ErrorDetailDto[];
  @ApiProperty({ example: '/api/v1/catalog/products' }) path: string;
  @ApiProperty({ example: 'POST' }) method: string;
  @ApiProperty({ format: 'date-time' }) timestamp: string;
  @ApiPropertyOptional() requestId?: string;
}
