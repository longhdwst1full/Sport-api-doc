import { CmsService } from './cms.service';

describe('CmsService', () => {
  it('lists published posts with related products', () => {
    const result = new CmsService().listPublished();
    expect(result.total).toBe(2);
    expect(result.items[0].relatedProductSlugs).toContain('combo-tap-gym-tai-nha');
  });
});
