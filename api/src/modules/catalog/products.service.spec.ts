import { ProductsService } from './products.service';

describe('ProductsService', () => {
  it('returns seeded storefront products', () => {
    const result = new ProductsService().list({ page: 1, limit: 12 });
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.meta.total).toBe(result.items.length);
  });

  it('filters products by search text', () => {
    const result = new ProductsService().list({ page: 1, limit: 12, search: 'combo' });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].slug).toBe('combo-tap-gym-tai-nha');
  });
});
