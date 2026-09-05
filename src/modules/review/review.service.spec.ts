import { ReviewService } from './review.service';

describe('ReviewService', () => {
  it('hides a review without removing its moderation history', () => {
    const service = new ReviewService();
    const review = service.listAdmin().items[0];

    const hidden = service.archive(review.id, {
      expectedVersion: review.version,
      reason: 'Đánh giá vi phạm chính sách',
    });

    expect(hidden).toMatchObject({
      status: 'REJECTED',
      moderationReason: 'Đánh giá vi phạm chính sách',
      version: 1,
    });
    expect(service.listApproved(review.productSlug).items).toHaveLength(0);
    expect(service.listAdmin().items).toContainEqual(expect.objectContaining({ id: review.id }));
  });

  it('rejects stale and repeated review deletion', () => {
    const service = new ReviewService();
    const review = service.listAdmin().items[0];

    expect(() =>
      service.archive(review.id, {
        expectedVersion: review.version + 1,
        reason: 'Yêu cầu cũ',
      }),
    ).toThrow('Review was changed by another request');

    service.archive(review.id, {
      expectedVersion: review.version,
      reason: 'Đánh giá vi phạm chính sách',
    });
    expect(() =>
      service.archive(review.id, {
        expectedVersion: review.version,
        reason: 'Ẩn lần hai',
      }),
    ).toThrow('Review is already hidden');
  });
});
