import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ArchiveContentPostDto,
  CONTENT_POST_STATUS,
  ContentPostDto,
  ContentPostListDto,
  CreateContentPostDto,
} from './cms.dto';

@Injectable()
export class CmsService {
  private readonly posts: ContentPostDto[] = [
    {
      id: 'post-home-gym',
      slug: 'setup-goc-tap-tai-nha',
      postType: 'TRAINING_GUIDE',
      title: 'Thiết lập góc tập tại nhà từ 6 m²',
      excerpt: 'Cách chọn thảm, tạ và khoảng trống an toàn cho một góc tập nhỏ.',
      body: 'Bắt đầu bằng mặt sàn ổn định, khoảng chuyển động và nhóm bài tập bạn duy trì được.',
      coverUrl: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48',
      relatedProductSlugs: ['combo-tap-gym-tai-nha'],
      publishedAt: '2026-08-20T02:00:00.000Z',
      status: CONTENT_POST_STATUS.PUBLISHED,
      version: 0,
    },
    {
      id: 'post-treadmill-guide',
      slug: 'chon-may-chay-bo-gia-dinh',
      postType: 'PRODUCT_GUIDE',
      title: '5 tiêu chí chọn máy chạy bộ gia đình',
      excerpt: 'Động cơ, vùng chạy, tải trọng, độ ồn và dịch vụ sau bán hàng.',
      body: 'Đừng chỉ nhìn tốc độ tối đa; vùng chạy và khả năng vận hành liên tục quan trọng hơn.',
      coverUrl: 'https://images.unsplash.com/photo-1576678927484-cc907957088c',
      relatedProductSlugs: ['may-chay-bo-dctd-pro-x1'],
      publishedAt: '2026-08-18T02:00:00.000Z',
      status: CONTENT_POST_STATUS.PUBLISHED,
      version: 0,
    },
  ];

  listPublished(): ContentPostListDto {
    const items = this.posts.filter(({ status }) => status === CONTENT_POST_STATUS.PUBLISHED);
    return { items, total: items.length };
  }

  listAdmin(): ContentPostListDto {
    return { items: [...this.posts], total: this.posts.length };
  }

  getBySlug(slug: string): ContentPostDto {
    const post = this.posts.find(
      (item) => item.slug === slug && item.status === CONTENT_POST_STATUS.PUBLISHED,
    );
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  create(input: CreateContentPostDto): ContentPostDto {
    const post: ContentPostDto = {
      ...input,
      id: randomUUID(),
      relatedProductSlugs: input.relatedProductSlugs ?? [],
      publishedAt: new Date().toISOString(),
      status: CONTENT_POST_STATUS.PUBLISHED,
      version: 0,
    };
    this.posts.unshift(post);
    return post;
  }

  archive(id: string, input: ArchiveContentPostDto): ContentPostDto {
    const post = this.posts.find((item) => item.id === id);
    if (!post) throw new NotFoundException('Post not found');
    if (post.version !== input.expectedVersion) {
      throw new ConflictException('Post was changed by another request');
    }
    if (post.status === CONTENT_POST_STATUS.ARCHIVED) {
      throw new ConflictException('Post is already archived');
    }
    post.status = CONTENT_POST_STATUS.ARCHIVED;
    post.archiveReason = input.reason.trim();
    post.archivedAt = new Date().toISOString();
    post.version += 1;
    return post;
  }
}
