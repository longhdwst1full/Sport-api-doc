import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProductDto } from './product.dto';

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
});
