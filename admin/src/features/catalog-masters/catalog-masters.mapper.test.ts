import { describe, expect, it } from 'vitest';
import { filterCatalogMasters } from './catalog-masters.mapper';

const items = [
  { code: 'NIKE', name: 'Nike', slug: 'nike' },
  { code: 'FITGEAR', name: 'FitGear Việt Nam', slug: 'fitgear-viet-nam' },
];

describe('filterCatalogMasters', () => {
  it('matches code, name and slug without case sensitivity', () => {
    expect(filterCatalogMasters(items, 'fitgear')).toEqual([items[1]]);
    expect(filterCatalogMasters(items, 'VIỆT NAM')).toEqual([items[1]]);
  });

  it('returns the complete list for an empty search', () => {
    expect(filterCatalogMasters(items, '  ')).toBe(items);
  });
});
