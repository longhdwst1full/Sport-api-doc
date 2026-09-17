import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CmsService } from './cms.service';

function buildService(overrides: { updatedCount?: number; row?: unknown } = {}) {
  const updateMany = jest.fn(
    (args: { data: Record<string, unknown> }): Promise<{ count: number }> => {
      void args;
      return Promise.resolve({ count: overrides.updatedCount ?? 1 });
    },
  );
  const findUnique = jest.fn().mockResolvedValue(
    overrides.row === undefined
      ? {
          id: 3n,
          postType: 'NEWS',
          slug: 'bai-viet',
          title: 'Tiêu đề',
          excerpt: 'Tóm tắt',
          body: 'Nội dung',
          coverUrl: 'https://example.test/a.jpg',
          relatedProductSlugs: [],
          status: 'PUBLISHED',
          publishedAt: new Date(),
          archivedAt: null,
          archiveReason: null,
          version: 2n,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      : overrides.row,
  );
  const prisma = {
    isEnabled: () => true,
    contentPost: { updateMany, findUnique },
    $transaction: jest.fn((work: (client: unknown) => unknown) =>
      work({ contentPost: { updateMany, findUnique } }),
    ),
  } as unknown as PrismaService;
  return { service: new CmsService(prisma), updateMany };
}

describe('CmsService sửa bài viết', () => {
  it('chỉ gửi những trường được truyền lên', async () => {
    const { service, updateMany } = buildService();

    await service.update('3', { expectedVersion: 1, title: 'Tiêu đề mới' });

    const data = updateMany.mock.calls[0]?.[0].data ?? {};
    expect(data.title).toBe('Tiêu đề mới');
    // Không truyền thì không ghi đè bằng undefined.
    expect('body' in data).toBe(false);
    expect(data.version).toEqual({ increment: 1 });
  });

  it('báo xung đột khi version không còn khớp', async () => {
    const { service } = buildService({ updatedCount: 0 });

    await expect(service.update('3', { expectedVersion: 1 })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('không cho sửa bài đã lưu trữ vì website không còn hiển thị bài đó', async () => {
    const { service } = buildService({
      updatedCount: 0,
      row: {
        id: 3n,
        postType: 'NEWS',
        slug: 's',
        title: 't',
        excerpt: 'e',
        body: 'b',
        coverUrl: 'https://example.test/a.jpg',
        relatedProductSlugs: [],
        status: 'ARCHIVED',
        publishedAt: new Date(),
        archivedAt: new Date(),
        archiveReason: 'Cũ',
        version: 5n,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    await expect(service.update('3', { expectedVersion: 1 })).rejects.toThrow(
      /đã lưu trữ nên không sửa được/,
    );
  });

  it('báo không tìm thấy khi bài viết không tồn tại', async () => {
    const { service } = buildService({ updatedCount: 0, row: null });

    await expect(service.update('3', { expectedVersion: 1 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
