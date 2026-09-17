import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type ContentPost } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { toDatabaseId, toEntityId } from '../../common/identifiers/entity-id';
import {
  ArchiveContentPostDto,
  CONTENT_POST_STATUS,
  ContentPostDto,
  ContentPostListDto,
  ContentPostType,
  CreateContentPostDto,
  UpdateContentPostDto,
} from './cms.dto';

@Injectable()
export class CmsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublished(postType?: ContentPostType): Promise<ContentPostListDto> {
    const rows = await this.prisma.contentPost.findMany({
      where: {
        // Storefront nhìn cờ hiển thị: ẩn tạm một bài viết không cần lưu trữ nó.
        status: CONTENT_POST_STATUS.PUBLISHED,
        isPublished: true,
        ...(postType ? { postType } : {}),
      },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    });
    return { items: rows.map((row) => this.toPost(row)), total: rows.length };
  }

  async listAdmin(postType?: ContentPostType): Promise<ContentPostListDto> {
    const rows = await this.prisma.contentPost.findMany({
      ...(postType ? { where: { postType } } : {}),
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    });
    return { items: rows.map((row) => this.toPost(row)), total: rows.length };
  }

  async getBySlug(slug: string): Promise<ContentPostDto> {
    const row = await this.prisma.contentPost.findFirst({
      where: { slug: slug.trim(), status: CONTENT_POST_STATUS.PUBLISHED, isPublished: true },
    });
    if (!row) throw new NotFoundException('Post not found');
    return this.toPost(row);
  }

  async create(input: CreateContentPostDto): Promise<ContentPostDto> {
    try {
      const row = await this.prisma.contentPost.create({
        data: {
          postType: input.postType,
          slug: input.slug.trim(),
          title: input.title.trim(),
          excerpt: input.excerpt.trim(),
          body: input.body,
          coverUrl: input.coverUrl.trim(),
          relatedProductSlugs: input.relatedProductSlugs ?? [],
          status: CONTENT_POST_STATUS.PUBLISHED,
          publishedAt: new Date(),
        },
      });
      return this.toPost(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Slug bài viết đã tồn tại');
      }
      throw error;
    }
  }

  /**
   * Sửa nội dung bài viết đã đăng.
   *
   * TRANSACTION: cập nhật theo `expectedVersion` nên hai người sửa cùng lúc thì đúng một người
   * thắng. Không cho sửa bài đã lưu trữ: bài đó không còn hiển thị, sửa vào chỉ tạo ảo giác là
   * website đã đổi.
   */
  async update(id: string, input: UpdateContentPostDto): Promise<ContentPostDto> {
    const postId = toDatabaseId(id);
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const updated = await transaction.contentPost.updateMany({
          where: {
            id: postId,
            version: BigInt(input.expectedVersion),
            status: CONTENT_POST_STATUS.PUBLISHED,
          },
          data: {
            ...(input.title !== undefined ? { title: input.title.trim() } : {}),
            ...(input.slug !== undefined ? { slug: input.slug.trim() } : {}),
            ...(input.excerpt !== undefined ? { excerpt: input.excerpt.trim() } : {}),
            ...(input.body !== undefined ? { body: input.body } : {}),
            ...(input.coverUrl !== undefined ? { coverUrl: input.coverUrl.trim() } : {}),
            ...(input.relatedProductSlugs !== undefined
              ? { relatedProductSlugs: input.relatedProductSlugs }
              : {}),
            ...(input.isPublished !== undefined ? { isPublished: input.isPublished } : {}),
            version: { increment: 1 },
          },
        });

        const row = await transaction.contentPost.findUnique({ where: { id: postId } });
        if (!row) throw new NotFoundException('Post not found');
        if (updated.count === 0) {
          if (row.status === CONTENT_POST_STATUS.ARCHIVED) {
            throw new ConflictException('Bài viết đã lưu trữ nên không sửa được');
          }
          throw new ConflictException('Post was changed by another request');
        }
        return this.toPost(row);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Slug bài viết đã tồn tại');
      }
      throw error;
    }
  }

  async archive(id: string, input: ArchiveContentPostDto): Promise<ContentPostDto> {
    const postId = toDatabaseId(id);
    return this.prisma.$transaction(async (transaction) => {
      // Conditional update theo version: hai request archive đồng thời thì đúng một
      // request thắng, request còn lại nhận 409 thay vì ghi đè lý do của nhau.
      const updated = await transaction.contentPost.updateMany({
        where: {
          id: postId,
          version: BigInt(input.expectedVersion),
          status: CONTENT_POST_STATUS.PUBLISHED,
        },
        data: {
          status: CONTENT_POST_STATUS.ARCHIVED,
          // Lưu trữ là gỡ khỏi website; cờ hiển thị phải tắt theo để hai giá trị không mâu thuẫn.
          isPublished: false,
          archiveReason: input.reason.trim(),
          archivedAt: new Date(),
          version: { increment: 1 },
        },
      });

      const row = await transaction.contentPost.findUnique({ where: { id: postId } });
      if (!row) throw new NotFoundException('Post not found');
      if (updated.count === 0) {
        if (row.status === CONTENT_POST_STATUS.ARCHIVED) {
          throw new ConflictException('Post is already archived');
        }
        throw new ConflictException('Post was changed by another request');
      }
      return this.toPost(row);
    });
  }

  private toPost(row: ContentPost): ContentPostDto {
    return {
      id: toEntityId(row.id),
      slug: row.slug,
      postType: row.postType as ContentPostDto['postType'],
      title: row.title,
      excerpt: row.excerpt,
      body: row.body,
      coverUrl: row.coverUrl,
      relatedProductSlugs: Array.isArray(row.relatedProductSlugs)
        ? row.relatedProductSlugs.filter((slug): slug is string => typeof slug === 'string')
        : [],
      publishedAt: row.publishedAt.toISOString(),
      status: row.status as ContentPostDto['status'],
      isPublished: row.isPublished,
      version: Number(row.version),
      ...(row.archivedAt ? { archivedAt: row.archivedAt.toISOString() } : {}),
      ...(row.archiveReason ? { archiveReason: row.archiveReason } : {}),
    };
  }
}
