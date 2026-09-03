import { describe, expect, it } from 'vitest';
import { toUpdateVariantDto, toVariantEditValues } from './variant-edit.mapper';

describe('variant edit mapping', () => {
  it('keeps SKU outside the mutable payload and normalizes empty optional fields', () => {
    const values = toVariantEditValues({
      id: 'variant-1',
      sku: 'IMMUTABLE-SKU',
      name: 'Size M',
      weightGrams: 0,
      status: 'ACTIVE',
      version: 3,
    });

    expect(toUpdateVariantDto({ ...values, name: ' Size L ', barcode: '' }, 3)).toEqual({
      name: 'Size L',
      barcode: null,
      weightGrams: 0,
      lengthMm: null,
      widthMm: null,
      heightMm: null,
      expectedVersion: 3,
    });
  });
});
