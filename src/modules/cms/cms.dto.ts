import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const CONTENT_POST_STATUS = {
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
} as const;

export type ContentPostStatus = (typeof CONTENT_POST_STATUS)[keyof typeof CONTENT_POST_STATUS];

export class ContentPostDto {
  @ApiProperty() id: string;
  @ApiProperty() slug: string;
  @ApiProperty({ enum: ['NEWS', 'TRAINING_GUIDE', 'PRODUCT_GUIDE', 'ABOUT'] })
  postType: 'NEWS' | 'TRAINING_GUIDE' | 'PRODUCT_GUIDE' | 'ABOUT';
  @ApiProperty() title: string;
  @ApiProperty() excerpt: string;
  @ApiProperty() body: string;
  @ApiProperty({ format: 'uri' }) coverUrl: string;
  @ApiProperty({ type: [String] }) relatedProductSlugs: string[];
  @ApiProperty({ format: 'date-time' }) publishedAt: string;
  @ApiProperty({ enum: Object.values(CONTENT_POST_STATUS) }) status: ContentPostStatus;
  @ApiProperty({ minimum: 0 }) version: number;
  @ApiPropertyOptional({ format: 'date-time' }) archivedAt?: string;
  @ApiPropertyOptional() archiveReason?: string;
}

export class ContentPostListDto {
  @ApiProperty({ type: [ContentPostDto] }) items: ContentPostDto[];
  @ApiProperty() total: number;
}

export class CreateContentPostDto {
  @ApiProperty({ enum: ['NEWS', 'TRAINING_GUIDE', 'PRODUCT_GUIDE', 'ABOUT'] })
  @IsIn(['NEWS', 'TRAINING_GUIDE', 'PRODUCT_GUIDE', 'ABOUT'])
  postType: ContentPostDto['postType'];
  @ApiProperty() @IsString() @IsNotEmpty() title: string;
  @ApiProperty() @IsString() @IsNotEmpty() slug: string;
  @ApiProperty() @IsString() @IsNotEmpty() excerpt: string;
  @ApiProperty() @IsString() @IsNotEmpty() body: string;
  @ApiProperty({ format: 'uri' }) @IsUrl() coverUrl: string;
  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  relatedProductSlugs?: string[];
}

export class ArchiveContentPostDto {
  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  expectedVersion: number;

  @ApiProperty({ minLength: 3, maxLength: 255, example: 'Nội dung không còn phù hợp' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(255)
  reason: string;
}
