import { describe, expect, it } from 'vitest';
import { addCartItem, cartSlice, clearCart } from './cart.slice';

describe('cartSlice', () => {
  it('increments the same product and clears the cart', () => {
    const product = { productId: 'product-1', name: 'Tạ tay', price: 450_000 };
    const once = cartSlice.reducer(undefined, addCartItem(product));
    const twice = cartSlice.reducer(once, addCartItem(product));

    expect(twice.items).toEqual([{ ...product, quantity: 2 }]);
    expect(cartSlice.reducer(twice, clearCart()).items).toEqual([]);
  });
});
