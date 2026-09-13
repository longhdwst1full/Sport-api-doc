import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type ContentPost } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { toDatabaseId, toEntityId } from '../../common/identifiers/entity-id';
import {
  ArchiveContentPostDto,
  CONTENT_POST_STATUS,
  ContentPostDto,
  ContentPostListDto,
  CreateContentPostDto,
} from './cms.dto';

@Injectable()
export class CmsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublished(): Promise<ContentPostListDto> {
    const rows = await this.prisma.contentPost.findMany({
      where: { status: CONTENT_POST_STATUS.PUBLISHED },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    });
    return { items: rows.map((row) => this.toPost(row)), total: rows.length };
  }

  async listAdmin(): Promise<ContentPostListDto> {
    const rows = await this.prisma.contentPost.findMany({
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    });
    return { items: rows.map((row) => this.toPost(row)), total: rows.length };
  }

  async getBySlug(slug: string): Promise<ContentPostDto> {
    const row = await this.prisma.contentPost.findFirst({
      where: { slug: slug.trim(), status: CONTENT_POST_STATUS.PUBLISHED },
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
      version: Number(row.version),
      ...(row.archivedAt ? { archivedAt: row.archivedAt.toISOString() } : {}),
      ...(row.archiveReason ? { archiveReason: row.archiveReason } : {}),
    };
  }
}
