import { IsIn, IsOptional, IsString } from 'class-validator';
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
}
