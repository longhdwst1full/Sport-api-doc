import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReviewCommentDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: ['CUSTOMER', 'STAFF'] }) authorType: 'CUSTOMER' | 'STAFF';
  @ApiProperty() authorName: string;
  @ApiProperty() content: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}

export class ProductReviewDto {
  @ApiProperty() id: string;
  @ApiProperty() productSlug: string;
  @ApiProperty() customerDisplayName: string;
  @ApiProperty({ minimum: 1, maximum: 5 }) rating: number;
  @ApiProperty() title: string;
  @ApiProperty() content: string;
  @ApiProperty() verifiedPurchase: boolean;
  @ApiProperty({ enum: ['PENDING', 'APPROVED', 'REJECTED'] })
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  @ApiProperty({ minimum: 0 }) version: number;
  @ApiPropertyOptional() moderationReason?: string;
  @ApiPropertyOptional({ format: 'date-time' }) moderatedAt?: string;
  @ApiProperty({ type: [ReviewCommentDto] }) comments: ReviewCommentDto[];
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}

export class ProductReviewListDto {
  @ApiProperty({ type: [ProductReviewDto] }) items: ProductReviewDto[];
  @ApiProperty() total: number;
  @ApiProperty() averageRating: number;
}

export class ModerateReviewDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] })
  @IsIn(['APPROVED', 'REJECTED'])
  status: 'APPROVED' | 'REJECTED';
  @ApiPropertyOptional() @IsString() @IsOptional() reason?: string;
  @ApiPropertyOptional({ minimum: 0 }) @IsInt() @Min(0) @IsOptional() expectedVersion?: number;
}

export class DeleteReviewDto {
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) expectedVersion: number;
  @ApiProperty({ minLength: 3, maxLength: 255, example: 'Đánh giá vi phạm chính sách' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(255)
  reason: string;
}
