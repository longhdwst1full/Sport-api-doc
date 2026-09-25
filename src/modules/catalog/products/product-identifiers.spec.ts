import {
  generateProductNo,
  generateProductSlug,
  generateSku,
  normalizeSku,
} from './product-identifiers';
import { PRODUCT_IDENTIFIER } from './product.constants';

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

  it('generates a short, unambiguous SKU that fits the manual SKU pattern', () => {
    const skus = Array.from({ length: 200 }, () => generateSku());

    for (const sku of skus) {
      expect(sku).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
      expect(sku).toMatch(PRODUCT_IDENTIFIER.SKU_PATTERN);
    }
    expect(new Set(skus).size).toBe(skus.length);
  });

  it('normalizes a manual SKU to upper case without surrounding spaces', () => {
    expect(normalizeSku('  td-02 ')).toBe('TD-02');
    expect(PRODUCT_IDENTIFIER.SKU_PATTERN.test('V-40+')).toBe(true);
    expect(PRODUCT_IDENTIFIER.SKU_PATTERN.test('TD 02')).toBe(false);
  });
});
