import { inStockVariantIds, stockedVariantIds } from './product-availability';

describe('product availability', () => {
  const standard = { variantId: 1n, components: [] };
  const combo = {
    variantId: 10n,
    components: [
      { variantId: 2n, quantity: 2 },
      { variantId: 3n, quantity: 1 },
    ],
  };

  it('reads stock of a standard SKU itself and of combo components, not of the combo row', () => {
    expect(stockedVariantIds([standard, combo]).sort()).toEqual([1n, 2n, 3n]);
  });

  it('treats reserved stock as unavailable', () => {
    const result = inStockVariantIds([standard], [
      { warehouseId: 1n, productVariantId: 1n, onHand: 2, reserved: 2 },
    ]);

    expect(result.has('1')).toBe(false);
  });

  it('does not add up stock across warehouses for a combo', () => {
    // Kho A đủ thành phần 2, kho B đủ thành phần 3 — không kho nào giao được cả combo.
    const result = inStockVariantIds([combo], [
      { warehouseId: 1n, productVariantId: 2n, onHand: 2, reserved: 0 },
      { warehouseId: 2n, productVariantId: 3n, onHand: 1, reserved: 0 },
    ]);

    expect(result.has('10')).toBe(false);
  });

  it('marks a combo in stock when one warehouse covers every component quantity', () => {
    const result = inStockVariantIds([combo], [
      { warehouseId: 1n, productVariantId: 2n, onHand: 3, reserved: 1 },
      { warehouseId: 1n, productVariantId: 3n, onHand: 1, reserved: 0 },
    ]);

    expect(result.has('10')).toBe(true);
  });
});
