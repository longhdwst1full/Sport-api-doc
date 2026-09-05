import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DeleteReviewDto,
  ModerateReviewDto,
  ProductReviewDto,
  ProductReviewListDto,
} from './review.dto';

@Injectable()
export class ReviewService {
  private readonly reviews: ProductReviewDto[] = [
    {
      id: 'review-run-x1',
      productSlug: 'may-chay-bo-dctd-pro-x1',
      customerDisplayName: 'Anh M.',
      rating: 5,
      title: 'Máy chạy êm, giao lắp đúng hẹn',
      content: 'Vùng chạy rộng và tư vấn vị trí đặt máy rất kỹ.',
      verifiedPurchase: true,
      status: 'APPROVED',
      version: 0,
      comments: [
        {
          id: 'comment-run-x1-shop',
          authorType: 'STAFF',
          authorName: 'DCTD Sport',
          content: 'Cảm ơn anh đã tin tưởng. Đội kỹ thuật luôn sẵn sàng hỗ trợ.',
          createdAt: '2026-08-23T04:00:00.000Z',
        },
      ],
      createdAt: '2026-08-22T04:00:00.000Z',
    },
  ];

  listApproved(productSlug: string): ProductReviewListDto {
    const items = this.reviews.filter(
      (review) => review.productSlug === productSlug && review.status === 'APPROVED',
    );
    const averageRating = items.length
      ? Number(
          (items.reduce((total, review) => total + review.rating, 0) / items.length).toFixed(1),
        )
      : 0;
    return { items, total: items.length, averageRating };
  }

  listAdmin(): ProductReviewListDto {
    const averageRating = this.reviews.length
      ? Number(
          (
            this.reviews.reduce((total, review) => total + review.rating, 0) / this.reviews.length
          ).toFixed(1),
        )
      : 0;
    return { items: [...this.reviews], total: this.reviews.length, averageRating };
  }

  moderate(id: string, input: ModerateReviewDto): ProductReviewDto {
    const review = this.reviews.find((item) => item.id === id);
    if (!review) throw new NotFoundException('Review not found');
    if (input.expectedVersion !== undefined && review.version !== input.expectedVersion) {
      throw new ConflictException('Review was changed by another request');
    }
    review.status = input.status;
    review.moderationReason = input.reason?.trim();
    review.moderatedAt = new Date().toISOString();
    review.version += 1;
    return review;
  }

  archive(id: string, input: DeleteReviewDto): ProductReviewDto {
    const review = this.reviews.find((item) => item.id === id);
    if (!review) throw new NotFoundException('Review not found');
    if (review.version !== input.expectedVersion) {
      throw new ConflictException('Review was changed by another request');
    }
    if (review.status === 'REJECTED') {
      throw new ConflictException('Review is already hidden');
    }
    review.status = 'REJECTED';
    review.moderationReason = input.reason.trim();
    review.moderatedAt = new Date().toISOString();
    review.version += 1;
    return review;
  }
}
