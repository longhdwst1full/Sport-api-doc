'use client';

import { ShoppingBag } from 'lucide-react';
import { useState } from 'react';
import { addCartItem } from '@/app/store/cart.slice';
import { useAppDispatch } from '@/app/store/hooks';
import type { ProductDetailDto } from '@/generated/api/catalog/models';
import { vndMoney } from '@/shared/format/money';

export function ProductPurchasePanel({ product }: { product: ProductDetailDto }) {
  const dispatch = useAppDispatch();
  const [selectedVariantId, setSelectedVariantId] = useState(product.variants[0]?.id ?? '');
  const selectedVariant = product.variants.find(({ id }) => id === selectedVariantId);
  const price = Number(selectedVariant?.effectivePrice ?? 0);
  const canAdd = Boolean(selectedVariant && price > 0);

  const addSelectedVariant = () => {
    if (!selectedVariant || !canAdd) return;
    dispatch(addCartItem({
      productId: product.id,
      variantId: selectedVariant.id,
      sku: selectedVariant.sku,
      productType: product.productType,
      name: `${product.name} — ${selectedVariant.name}`,
      price,
    }));
  };

  return (
    <section className="rounded-3xl bg-white p-6 shadow-card" aria-labelledby="purchase-heading">
      <h2 id="purchase-heading" className="text-lg font-bold">Chọn phiên bản</h2>
      <div className="mt-4 grid gap-3">
        {product.variants.map((variant) => (
          <button
            key={variant.id}
            type="button"
            aria-pressed={variant.id === selectedVariantId}
            className={`rounded-2xl border p-4 text-left transition ${
              variant.id === selectedVariantId
                ? 'border-brand-600 bg-brand-50'
                : 'border-stone-200 hover:border-brand-300'
            }`}
            onClick={() => setSelectedVariantId(variant.id)}
          >
            <span className="block font-semibold">{variant.name}</span>
            <span className="mt-1 block text-sm text-stone-500">{variant.sku}</span>
            <strong className="mt-2 block text-brand-700">
              {variant.effectivePrice ? vndMoney.format(Number(variant.effectivePrice)) : 'Chưa có giá'}
            </strong>
          </button>
        ))}
      </div>

      {selectedVariant?.bundle && (
        <div className="mt-5 rounded-2xl bg-stone-50 p-4">
          <h3 className="font-bold">Combo này gồm</h3>
          <ul className="mt-2 space-y-2 text-sm text-stone-700">
            {selectedVariant.bundle.components.map((component) => (
              <li key={component.componentVariantId}>
                {component.quantity} × {component.componentName} ({component.componentSku})
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-stone-500">
            Combo là một đơn vị bán; khi trả hàng cần trả nguyên bộ.
          </p>
        </div>
      )}

      <button
        type="button"
        disabled={!canAdd}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-stone-300"
        onClick={addSelectedVariant}
      >
        <ShoppingBag className="size-5" /> Thêm SKU đã chọn vào giỏ
      </button>
      <p className="mt-3 text-xs text-stone-500">
        Giá và tồn kho sẽ được kiểm tra lại trực tuyến khi thanh toán.
      </p>
    </section>
  );
}
