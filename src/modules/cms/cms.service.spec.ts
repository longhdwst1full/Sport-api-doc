import { PrismaService } from '../../database/prisma.service';
import { CmsService } from './cms.service';

type PostRow = {
  id: bigint;
  postType: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  coverUrl: string;
  coverAssetId: bigint | null;
  relatedProductSlugs: unknown;
  status: string;
  isPublished: boolean;
  publishedAt: Date;
  archivedAt: Date | null;
  archiveReason: string | null;
  version: bigint;
  createdAt: Date;
  updatedAt: Date;
};

function post(id: number, overrides: Partial<PostRow> = {}): PostRow {
  return {
    id: BigInt(id),
    postType: 'TRAINING_GUIDE',
    slug: `bai-viet-${id}`,
    title: `Bài viết ${id}`,
    excerpt: 'Tóm tắt',
    body: 'Nội dung',
    coverUrl: 'https://example.invalid/cover.jpg',
    coverAssetId: null,
    relatedProductSlugs: ['combo-tap-gym-tai-nha'],
    status: 'PUBLISHED',
    isPublished: true,
    publishedAt: new Date('2026-08-20T02:00:00.000Z'),
    archivedAt: null,
    archiveReason: null,
    version: 0n,
    createdAt: new Date('2026-08-20T02:00:00.000Z'),
    updatedAt: new Date('2026-08-20T02:00:00.000Z'),
    ...overrides,
  };
}

/**
 * Fake Prisma tối thiểu cho đúng các thao tác CmsService dùng. Mục tiêu là kiểm tra
 * quyết định của service (lọc theo trạng thái, optimistic lock, transition một chiều),
 * không phải kiểm tra Prisma. Hành vi chạm cơ sở dữ liệu thật thuộc integration test.
 */
function createPrismaDouble(rows: PostRow[]) {
  const store = rows.map((row) => ({ ...row }));
  const matches = (row: PostRow, where: Record<string, unknown> = {}): boolean =>
    Object.entries(where).every(([key, value]) => row[key as keyof PostRow] === value);

  const contentPost = {
    findMany: ({ where }: { where?: Record<string, unknown> } = {}) =>
      Promise.resolve(store.filter((row) => matches(row, where)).map((row) => ({ ...row }))),
    findFirst: ({ where }: { where?: Record<string, unknown> } = {}) =>
      Promise.resolve(store.find((row) => matches(row, where)) ?? null),
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
    contentPost,
    $transaction: (fn: (transaction: unknown) => unknown) => Promise.resolve(fn(client)),
  };
  return client as unknown as PrismaService;
}

describe('CmsService', () => {
  it('chỉ trả bài viết đã xuất bản cho storefront', async () => {
    const service = new CmsService(
      createPrismaDouble([
        post(1),
        post(2, { slug: 'da-luu-tru', status: 'ARCHIVED', isPublished: false }),
      ]),
    );

    const result = await service.listPublished();

    expect(result.total).toBe(1);
    expect(result.items[0].relatedProductSlugs).toContain('combo-tap-gym-tai-nha');
    expect(await service.listAdmin()).toMatchObject({ total: 2 });
  });

  it('lưu trữ bài viết mà vẫn giữ lịch sử quản trị', async () => {
    const service = new CmsService(createPrismaDouble([post(1)]));

    const archived = await service.archive('1', {
      expectedVersion: 0,
      reason: 'Nội dung đã hết hiệu lực',
    });

    expect(archived).toMatchObject({ status: 'ARCHIVED', version: 1 });
    expect(archived.archiveReason).toBe('Nội dung đã hết hiệu lực');
    expect((await service.listPublished()).items).toHaveLength(0);
    expect((await service.listAdmin()).items).toHaveLength(1);
  });

  it('từ chối yêu cầu lưu trữ dựa trên version cũ', async () => {
    const service = new CmsService(createPrismaDouble([post(1)]));

    await expect(
      service.archive('1', { expectedVersion: 1, reason: 'Yêu cầu cũ' }),
    ).rejects.toThrow('Post was changed by another request');
  });

  it('từ chối lưu trữ lần hai', async () => {
    const service = new CmsService(
      createPrismaDouble([
        post(1, { status: 'ARCHIVED', archivedAt: new Date(), archiveReason: 'Đã ẩn', version: 1n }),
      ]),
    );

    await expect(
      service.archive('1', { expectedVersion: 1, reason: 'Ẩn lần hai' }),
    ).rejects.toThrow('Post is already archived');
  });
});
