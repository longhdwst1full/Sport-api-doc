import { IsArray, IsIn, IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
