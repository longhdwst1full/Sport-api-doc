import { afterEach, describe, expect, it, vi } from 'vitest';
import { readPersistedCart } from './root.saga';

describe('readPersistedCart', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps only the minimal valid cart shape', () => {
    const removeItem = vi.fn();
    vi.stubGlobal('localStorage', {
      getItem: () =>
        JSON.stringify([
          {
            productId: 'product-1',
            name: 'Tạ tay',
            price: 450_000,
            quantity: 2,
            customerEmail: 'x@y.z',
          },
          { productId: 'product-2', name: 'Thảm', price: 200_000 },
        ]),
      removeItem,
    });

    expect(readPersistedCart()).toEqual([
      { productId: 'product-1', name: 'Tạ tay', price: 450_000, quantity: 2 },
    ]);
    expect(removeItem).not.toHaveBeenCalled();
  });
});
