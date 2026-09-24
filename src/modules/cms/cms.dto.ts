import {
  IsArray,
  IsBoolean,
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

/** Loại bài viết. Phải khớp ràng buộc `posts_post_type_check` ở database. */
export const CONTENT_POST_TYPES = [
  'NEWS',
  'TRAINING_GUIDE',
  'PRODUCT_GUIDE',
  'ABOUT',
  'POLICY',
] as const;

export type ContentPostType = (typeof CONTENT_POST_TYPES)[number];

export class ContentPostDto {
  @ApiProperty() id: string;
  @ApiProperty() slug: string;
  @ApiProperty({ enum: CONTENT_POST_TYPES, enumName: 'ContentPostType' })
  postType: ContentPostType;

  @ApiProperty({
    example: true,
    description: 'Có hiển thị trên website hay không; tách khỏi status để ẩn tạm bài viết',
  })
  isPublished: boolean;
  @ApiProperty() title: string;
  @ApiProperty() excerpt: string;
  @ApiProperty() body: string;
  @ApiProperty({ format: 'uri' }) coverUrl: string;
  @ApiProperty({ type: [String] }) relatedProductSlugs: string[];
  @ApiProperty({ format: 'date-time' }) publishedAt: string;
  @ApiProperty({ enum: Object.values(CONTENT_POST_STATUS), enumName: 'ContentPostStatus' }) status: ContentPostStatus;
  @ApiProperty({ minimum: 0 }) version: number;
  @ApiPropertyOptional({ format: 'date-time' }) archivedAt?: string;
  @ApiPropertyOptional() archiveReason?: string;
}

export class ContentPostListDto {
  @ApiProperty({ type: [ContentPostDto] }) items: ContentPostDto[];
  @ApiProperty() total: number;
}

export class CreateContentPostDto {
  @ApiProperty({ enum: CONTENT_POST_TYPES, enumName: 'ContentPostType' })
  @IsIn(CONTENT_POST_TYPES)
  postType: ContentPostType;
  @ApiProperty() @IsString() @IsNotEmpty() title: string;
  /**
   * Bỏ trống thì backend tự sinh từ tiêu đề (bỏ dấu, nối `-`, trùng thì thêm `-2`). Chỉ gửi lên khi
   * cần giữ nguyên một đường dẫn đã công bố ở nơi khác.
   */
  @ApiPropertyOptional({
    description: 'Đường dẫn bài viết. Bỏ trống để backend sinh từ tiêu đề.',
    example: 'huong-dan-chon-ta-tay',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  slug?: string;
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

export class ListContentPostsQueryDto {
  @ApiPropertyOptional({
    enum: CONTENT_POST_TYPES, enumName: 'ContentPostType',
    description: 'Lọc theo loại bài viết. Bỏ trống để lấy tất cả.',
  })
  @IsOptional()
  @IsIn(CONTENT_POST_TYPES)
  postType?: ContentPostType;
}

export class UpdateContentPostDto {
  @ApiProperty({ minimum: 0, description: 'Version bài viết mà Admin đang xem' })
  @IsInt()
  @Min(0)
  expectedVersion: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() slug?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() excerpt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() body?: string;
  @ApiPropertyOptional({ format: 'uri' }) @IsOptional() @IsUrl() coverUrl?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  relatedProductSlugs?: string[];

  @ApiPropertyOptional({ description: 'Bật/tắt hiển thị trên website; không đổi status' })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
