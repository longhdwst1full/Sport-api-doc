import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type CartItem = {
  productId: string;
  variantId: string;
  sku: string;
  productType: 'STANDARD' | 'BUNDLE';
  name: string;
  price: number;
  quantity: number;
};

type CartState = { items: CartItem[] };

const initialState: CartState = { items: [] };

export const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    addCartItem: (state, action: PayloadAction<Omit<CartItem, 'quantity'>>) => {
      const existing = state.items.find((item) => item.variantId === action.payload.variantId);
      if (existing) existing.quantity += 1;
      else state.items.push({ ...action.payload, quantity: 1 });
    },
    hydrateCart: (state, action: PayloadAction<CartItem[]>) => {
      state.items = action.payload;
    },
    clearCart: (state) => {
      state.items = [];
    },
  },
});

export const { addCartItem, clearCart, hydrateCart } = cartSlice.actions;
