import {
  generateProductNo,
  generateProductSlug,
  generateSku,
} from './product-identifiers';

describe('catalog product identifiers', () => {
  it('generates a unique-format immutable product number within the database limit', () => {
    const first = generateProductNo();
    const second = generateProductNo();

    expect(first).toMatch(/^PRD-[A-F0-9]{24}$/);
    expect(first.length).toBeLessThanOrEqual(32);
    expect(second).not.toBe(first);
  });

  it('generates a Vietnamese-safe unique slug from name and product number', () => {
    expect(generateProductSlug('  Giày chạy bộ Địa hình  ', 'PRD-ABC123')).toBe(
      'giay-chay-bo-dia-hinh-prd-abc123',
    );
  });

  it('caps a generated slug at the database field length', () => {
    expect(generateProductSlug('Sản phẩm '.repeat(80), 'PRD-ABC123')).toHaveLength(255);
  });

  it('generates a SKU scoped visibly to its product number', () => {
    const sku = generateSku('PRD-ABC123');

    expect(sku).toMatch(/^PRD-ABC123-SKU-[A-F0-9]{20}$/);
    expect(sku.length).toBeLessThanOrEqual(64);
  });
});
