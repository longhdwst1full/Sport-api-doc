import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { ProductReview, ProductReviewComment } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { toDatabaseId, toEntityId } from '../../common/identifiers/entity-id';
import {
  DeleteReviewDto,
  ModerateReviewDto,
  ProductReviewDto,
  ProductReviewListDto,
} from './review.dto';

type ReviewWithComments = ProductReview & { comments: ProductReviewComment[] };

const reviewInclude = { comments: { orderBy: { createdAt: 'asc' as const } } };

@Injectable()
export class ReviewService {
  constructor(private readonly prisma: PrismaService) {}

  async listApproved(productSlug: string): Promise<ProductReviewListDto> {
    // Storefront chỉ thấy nội dung đã được kiểm duyệt (rule commerce-content-media).
    const rows = await this.prisma.productReview.findMany({
      where: { productSlug: productSlug.trim(), status: 'APPROVED' },
      include: reviewInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return this.toList(rows);
  }

  async listAdmin(): Promise<ProductReviewListDto> {
    const rows = await this.prisma.productReview.findMany({
      include: reviewInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return this.toList(rows);
  }

  async moderate(id: string, input: ModerateReviewDto): Promise<ProductReviewDto> {
    return this.transition(id, {
      status: input.status,
      reason: input.reason?.trim(),
      expectedVersion: input.expectedVersion,
    });
  }

  async archive(id: string, input: DeleteReviewDto): Promise<ProductReviewDto> {
    return this.transition(id, {
      status: 'REJECTED',
      reason: input.reason.trim(),
      expectedVersion: input.expectedVersion,
      rejectAlreadyHidden: true,
    });
  }

  private async transition(
    id: string,
    command: {
      status: 'APPROVED' | 'REJECTED';
      reason?: string;
      expectedVersion?: number;
      rejectAlreadyHidden?: boolean;
    },
  ): Promise<ProductReviewDto> {
    const reviewId = toDatabaseId(id);
    return this.prisma.$transaction(async (transaction) => {
      // `expectedVersion` là tùy chọn ở moderate: khi thiếu thì bỏ điều kiện version,
      // giữ đúng hành vi contract hiện tại thay vì bắt buộc client gửi version.
      const updated = await transaction.productReview.updateMany({
        where: {
          id: reviewId,
          ...(command.expectedVersion !== undefined
            ? { version: BigInt(command.expectedVersion) }
            : {}),
          ...(command.rejectAlreadyHidden ? { status: { not: 'REJECTED' } } : {}),
        },
        data: {
          status: command.status,
          moderationReason: command.reason ?? null,
          moderatedAt: new Date(),
          version: { increment: 1 },
        },
      });

      const row = await transaction.productReview.findUnique({
        where: { id: reviewId },
        include: reviewInclude,
      });
      if (!row) throw new NotFoundException('Review not found');
      if (updated.count === 0) {
        if (command.rejectAlreadyHidden && row.status === 'REJECTED') {
          throw new ConflictException('Review is already hidden');
        }
        throw new ConflictException('Review was changed by another request');
      }
      return this.toReview(row);
    });
  }

  private toList(rows: ReviewWithComments[]): ProductReviewListDto {
    const averageRating = rows.length
      ? Number((rows.reduce((total, row) => total + row.rating, 0) / rows.length).toFixed(1))
      : 0;
    return { items: rows.map((row) => this.toReview(row)), total: rows.length, averageRating };
  }

  private toReview(row: ReviewWithComments): ProductReviewDto {
    return {
      id: toEntityId(row.id),
      productSlug: row.productSlug,
      customerDisplayName: row.customerDisplayName,
      rating: row.rating,
      title: row.title,
      content: row.content,
      verifiedPurchase: row.verifiedPurchase,
      status: row.status as ProductReviewDto['status'],
      version: Number(row.version),
      ...(row.moderationReason ? { moderationReason: row.moderationReason } : {}),
      ...(row.moderatedAt ? { moderatedAt: row.moderatedAt.toISOString() } : {}),
      comments: row.comments.map((comment) => ({
        id: toEntityId(comment.id),
        authorType: comment.authorType as 'CUSTOMER' | 'STAFF',
        authorName: comment.authorName,
        content: comment.content,
        createdAt: comment.createdAt.toISOString(),
      })),
      createdAt: row.createdAt.toISOString(),
    };
  }
}
