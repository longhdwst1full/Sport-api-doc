import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProductDto, UpdateProductDto } from './product.dto';

describe('CreateProductDto', () => {
  const base = {
    name: 'Giày chạy bộ',
    categoryIds: ['1'],
    primaryCategoryId: '1',
  };

  it('accepts product information and multiple nested initial variants', async () => {
    const input = plainToInstance(CreateProductDto, {
      ...base,
      variants: [
        { name: 'Đen - 40', weightGrams: 850 },
        { name: 'Đen - 41', barcode: 'BAR-41' },
      ],
    });

    await expect(validate(input)).resolves.toHaveLength(0);
  });

  it('requires at least one initial variant', async () => {
    const errors = await validate(plainToInstance(CreateProductDto, { ...base, variants: [] }));

    expect(errors.find(({ property }) => property === 'variants')?.constraints).toHaveProperty(
      'arrayNotEmpty',
    );
  });

  it('validates fields inside every initial variant', async () => {
    const errors = await validate(
      plainToInstance(CreateProductDto, { ...base, variants: [{ name: '' }] }),
    );
    const variantsError = errors.find(({ property }) => property === 'variants');

    expect(variantsError?.children?.[0]?.children?.some(({ property }) => property === 'name'))
      .toBe(true);
  });

  it('normalizes a manual SKU to upper case and rejects spaces or symbols', async () => {
    const valid = plainToInstance(CreateProductDto, { ...base, variants: [{ name: 'TD-02', sku: ' td-02 ' }] });
    await expect(validate(valid)).resolves.toHaveLength(0);
    expect(valid.variants[0].sku).toBe('TD-02');

    const invalid = plainToInstance(CreateProductDto, { ...base, variants: [{ name: 'x', sku: 'TD 02' }] });
    const errors = await validate(invalid);
    expect(JSON.stringify(errors)).toContain('matches');
  });
});

describe('UpdateProductDto', () => {
  it('limits shortDescription to 1000 characters like CreateProductDto', async () => {
    const errors = await validate(
      plainToInstance(UpdateProductDto, { expectedVersion: 0, shortDescription: 'x'.repeat(1001) }),
    );

    expect(errors.find(({ property }) => property === 'shortDescription')?.constraints).toHaveProperty('maxLength');
  });

  it('validates nested specifications when they are sent', async () => {
    const errors = await validate(
      plainToInstance(UpdateProductDto, { expectedVersion: 0, specifications: [{ code: 'MAX_LOAD', values: 'x' }] }),
    );

    expect(errors.some(({ property }) => property === 'specifications')).toBe(true);
  });
});
