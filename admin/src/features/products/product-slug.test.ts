import { describe, expect, it } from 'vitest';
import { createProductSlug } from './product-slug';

describe('createProductSlug', () => {
  it('combines the normalized Vietnamese name and product number', () => {
    expect(createProductSlug('Áo tập Gym Pro', 'SP-001')).toBe('ao-tap-gym-pro-sp-001');
  });

  it('removes repeated separators and trims the result', () => {
    expect(createProductSlug('  Bộ tạ  20KG!!! ', ' TA--020 ')).toBe('bo-ta-20kg-ta-020');
  });

  it('can generate a partial slug while the form is being completed', () => {
    expect(createProductSlug('', 'SP-001')).toBe('sp-001');
    expect(createProductSlug('Thảm Yoga', '')).toBe('tham-yoga');
  });
});
