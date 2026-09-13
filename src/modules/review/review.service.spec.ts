import { PrismaService } from '../../database/prisma.service';
import { ReviewService } from './review.service';

type CommentRow = {
  id: bigint;
  authorType: string;
  authorName: string;
  content: string;
  createdAt: Date;
};

type ReviewRow = {
  id: bigint;
  productSlug: string;
  productId: bigint | null;
  customerDisplayName: string;
  customerId: bigint | null;
  orderItemId: bigint | null;
  rating: number;
  title: string;
  content: string;
  verifiedPurchase: boolean;
  status: string;
  moderationReason: string | null;
  moderatedAt: Date | null;
  moderatedBy: bigint | null;
  version: bigint;
  createdAt: Date;
  updatedAt: Date;
  comments: CommentRow[];
};

function review(id: number, overrides: Partial<ReviewRow> = {}): ReviewRow {
  return {
    id: BigInt(id),
    productSlug: 'may-chay-bo-dctd-pro-x1',
    productId: null,
    customerDisplayName: 'Anh M.',
    customerId: null,
    orderItemId: null,
    rating: 5,
    title: 'Máy chạy êm, giao lắp đúng hẹn',
    content: 'Vùng chạy rộng và tư vấn vị trí đặt máy rất kỹ.',
    verifiedPurchase: false,
    status: 'APPROVED',
    moderationReason: null,
    moderatedAt: new Date('2026-08-22T06:00:00.000Z'),
    moderatedBy: null,
    version: 0n,
    createdAt: new Date('2026-08-22T04:00:00.000Z'),
    updatedAt: new Date('2026-08-22T04:00:00.000Z'),
    comments: [
      {
        id: 10n,
        authorType: 'CUSTOMER',
        authorName: 'DCTD Sport',
        content: 'Cảm ơn anh đã tin tưởng.',
        createdAt: new Date('2026-08-23T04:00:00.000Z'),
      },
    ],
    ...overrides,
  };
}

/**
 * Fake Prisma tối thiểu cho đúng các thao tác ReviewService dùng, gồm cả toán tử
 * `{ not: ... }` mà transition dùng để chặn ẩn lần hai. Kiểm tra quyết định của
 * service, không kiểm tra Prisma.
 */
function createPrismaDouble(rows: ReviewRow[]) {
  const store = rows.map((row) => ({ ...row, comments: [...row.comments] }));

  const matchesValue = (actual: unknown, expected: unknown): boolean => {
    if (expected !== null && typeof expected === 'object' && 'not' in expected) {
      return actual !== (expected as { not: unknown }).not;
    }
    return actual === expected;
  };
  const matches = (row: ReviewRow, where: Record<string, unknown> = {}): boolean =>
    Object.entries(where).every(([key, value]) =>
      matchesValue(row[key as keyof ReviewRow], value),
    );

  const productReview = {
    findMany: ({ where }: { where?: Record<string, unknown> } = {}) =>
      Promise.resolve(store.filter((row) => matches(row, where)).map((row) => ({ ...row }))),
    findUnique: ({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(store.find((row) => matches(row, where)) ?? null),
    updateMany: ({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => {
      const target = store.find((row) => matches(row, where));
      if (!target) return Promise.resolve({ count: 0 });
      for (const [key, value] of Object.entries(data)) {
        if (key === 'version') target.version += 1n;
        else Object.assign(target, { [key]: value });
      }
      return Promise.resolve({ count: 1 });
    },
  };

  const client = {
    productReview,
    $transaction: (fn: (transaction: unknown) => unknown) => Promise.resolve(fn(client)),
  };
  return client as unknown as PrismaService;
}

describe('ReviewService', () => {
  it('storefront chỉ thấy đánh giá đã duyệt', async () => {
    const service = new ReviewService(
      createPrismaDouble([review(1), review(2, { status: 'PENDING' })]),
    );

    const approved = await service.listApproved('may-chay-bo-dctd-pro-x1');

    expect(approved.total).toBe(1);
    expect(approved.averageRating).toBe(5);
    expect(approved.items[0].comments).toHaveLength(1);
    expect(await service.listAdmin()).toMatchObject({ total: 2 });
  });

  it('ẩn đánh giá mà vẫn giữ lịch sử kiểm duyệt', async () => {
    const service = new ReviewService(createPrismaDouble([review(1)]));

    const hidden = await service.archive('1', {
      expectedVersion: 0,
      reason: 'Đánh giá vi phạm chính sách',
    });

    expect(hidden).toMatchObject({
      status: 'REJECTED',
      moderationReason: 'Đánh giá vi phạm chính sách',
      version: 1,
    });
    expect((await service.listApproved(hidden.productSlug)).items).toHaveLength(0);
    expect((await service.listAdmin()).items).toHaveLength(1);
  });

  it('từ chối yêu cầu ẩn dựa trên version cũ', async () => {
    const service = new ReviewService(createPrismaDouble([review(1)]));

    await expect(
      service.archive('1', { expectedVersion: 1, reason: 'Yêu cầu cũ' }),
    ).rejects.toThrow('Review was changed by another request');
  });

  it('từ chối ẩn lần hai', async () => {
    const service = new ReviewService(
      createPrismaDouble([review(1, { status: 'REJECTED', version: 1n })]),
    );

    await expect(
      service.archive('1', { expectedVersion: 1, reason: 'Ẩn lần hai' }),
    ).rejects.toThrow('Review is already hidden');
  });

  it('duyệt đánh giá không cần gửi version', async () => {
    const service = new ReviewService(
      createPrismaDouble([review(1, { status: 'PENDING', moderatedAt: null })]),
    );

    const approved = await service.moderate('1', { status: 'APPROVED' });

    expect(approved).toMatchObject({ status: 'APPROVED', version: 1 });
    expect(approved.moderatedAt).toBeDefined();
  });
});
