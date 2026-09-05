import { CmsService } from './cms.service';

describe('CmsService', () => {
  it('lists published posts with related products', () => {
    const result = new CmsService().listPublished();
    expect(result.total).toBe(2);
    expect(result.items[0].relatedProductSlugs).toContain('combo-tap-gym-tai-nha');
  });

  it('archives a post without removing its administration history', () => {
    const service = new CmsService();
    const post = service.listAdmin().items[0];

    const archived = service.archive(post.id, {
      expectedVersion: post.version,
      reason: 'Nội dung đã hết hiệu lực',
    });

    expect(archived).toMatchObject({ status: 'ARCHIVED', version: 1 });
    expect(service.listPublished().items).not.toContainEqual(expect.objectContaining({ id: post.id }));
    expect(service.listAdmin().items).toContainEqual(expect.objectContaining({ id: post.id }));
  });

  it('rejects a stale post archive request', () => {
    const service = new CmsService();
    const post = service.listAdmin().items[0];

    expect(() =>
      service.archive(post.id, { expectedVersion: post.version + 1, reason: 'Yêu cầu cũ' }),
    ).toThrow('Post was changed by another request');
  });
});
