import type { PrismaService } from '../../database/prisma.service';
import { CmsService } from './cms.service';
import type { CreateContentPostDto } from './cms.dto';

/**
 * Slug do backend sinh từ tiêu đề. Người soạn bài không có nghĩa vụ tự nghĩ ra một đường dẫn chưa
 * ai dùng cho bài họ vừa đặt tên, và slug nhập tay lệch tiêu đề thì không ai sửa lại nữa.
 */
function createService(existingSlugs: string[]) {
  const create = jest
    .fn<Promise<{ slug: string }>, [{ data: { slug: string } }]>()
    .mockImplementation(({ data }) =>
      Promise.resolve({
        id: 1n,
        postType: 'NEWS',
        slug: data.slug,
        title: 'x',
        excerpt: 'x',
        body: 'x',
        coverUrl: 'https://example.invalid/a.jpg',
        relatedProductSlugs: [],
        status: 'PUBLISHED',
        isPublished: true,
        publishedAt: new Date('2026-09-21T00:00:00.000Z'),
        archivedAt: null,
        archiveReason: null,
        version: 0n,
      }),
    );
  const transactionClient = {
    contentPost: {
      create,
      findMany: jest.fn().mockResolvedValue(existingSlugs.map((slug) => ({ slug }))),
    },
  };
  const prisma = {
    $transaction: (run: (client: typeof transactionClient) => unknown) => run(transactionClient),
  } as unknown as PrismaService;

  return { service: new CmsService(prisma), create };
}

function input(overrides: Partial<CreateContentPostDto> = {}): CreateContentPostDto {
  return {
    postType: 'NEWS',
    title: 'Hướng dẫn chọn tạ tay',
    excerpt: 'Tóm tắt',
    body: '<p>Nội dung</p>',
    coverUrl: 'https://example.invalid/a.jpg',
    ...overrides,
  } as CreateContentPostDto;
}

describe('CmsService sinh slug bài viết', () => {
  it('bỏ dấu tiếng Việt và nối bằng dấu gạch ngang', async () => {
    const { service, create } = createService([]);

    const post = await service.create(input());

    expect(post.slug).toBe('huong-dan-chon-ta-tay');
    expect(create.mock.calls[0]?.[0].data.slug).toBe('huong-dan-chon-ta-tay');
  });

  it('nối hậu tố khi tiêu đề trùng bài đã có', async () => {
    const { service } = createService(['huong-dan-chon-ta-tay', 'huong-dan-chon-ta-tay-2']);

    const post = await service.create(input());

    expect(post.slug).toBe('huong-dan-chon-ta-tay-3');
  });

  it('giữ nguyên slug người soạn gửi lên', async () => {
    const { service } = createService([]);

    const post = await service.create(input({ slug: '  duong-dan-da-cong-bo  ' }));

    expect(post.slug).toBe('duong-dan-da-cong-bo');
  });

  /** Tiêu đề không còn ký tự nào tạo được slug vẫn phải ra một đường dẫn hợp lệ. */
  it('rơi về bai-viet khi tiêu đề không tạo được slug', async () => {
    const { service } = createService([]);

    const post = await service.create(input({ title: '🔥🔥🔥' }));

    expect(post.slug).toBe('bai-viet');
  });
});
