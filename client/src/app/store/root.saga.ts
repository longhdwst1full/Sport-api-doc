import { select, takeEvery } from 'redux-saga/effects';
import { addCartItem, clearCart, type CartItem } from './cart.slice';
import type { RootState } from './store';

const CART_STORAGE_KEY = 'dctd-storefront-cart-v2';

function isCartItem(value: unknown): value is CartItem {
  return (
    typeof value === 'object' &&
    value !== null &&
    'productId' in value &&
    typeof value.productId === 'string' &&
    'variantId' in value &&
    typeof value.variantId === 'string' &&
    'sku' in value &&
    typeof value.sku === 'string' &&
    'productType' in value &&
    (value.productType === 'STANDARD' || value.productType === 'BUNDLE') &&
    'name' in value &&
    typeof value.name === 'string' &&
    'price' in value &&
    typeof value.price === 'number' &&
    'quantity' in value &&
    typeof value.quantity === 'number' &&
    value.quantity > 0
  );
}

export function readPersistedCart(): CartItem[] {
  try {
    const value = localStorage.getItem(CART_STORAGE_KEY);
    if (!value) return [];
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter(isCartItem).map(({ productId, variantId, sku, productType, name, price, quantity }) => ({
          productId,
          variantId,
          sku,
          productType,
          name,
          price,
          quantity,
        }))
      : [];
  } catch {
    localStorage.removeItem(CART_STORAGE_KEY);
    return [];
  }
}

function* persistCart() {
  const items: CartItem[] = yield select((state: RootState) => state.cart.items);
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
}

export function* rootSaga() {
  yield takeEvery([addCartItem.type, clearCart.type], persistCart);
}
