import type {
  CreatePriceDto,
  ProductDetailDto,
  ReplacePriceDto,
} from '@/generated/api/catalog/models';

export interface PriceFormInput {
  variantId: string;
  amount: string;
  startsAt: string;
}

export type PriceCommand =
  | { kind: 'create'; variantId: string; data: CreatePriceDto }
  | { kind: 'replace'; variantId: string; data: ReplacePriceDto };

export function isProductPublishReady(product: ProductDetailDto): boolean {
  if (product.status !== 'DRAFT') return false;
  const activeVariants = product.variants.filter((variant) => variant.status === 'ACTIVE');
  if (product.productType === 'BUNDLE') {
    return activeVariants.length > 0 && activeVariants.every((variant) => (
      Boolean(variant.effectivePrice)
      && variant.bundle?.status === 'ACTIVE'
      && variant.bundle.components.length > 0
    ));
  }
  return activeVariants.some((variant) => Boolean(variant.effectivePrice) && !variant.bundle);
}

export function buildPriceCommand(
  product: ProductDetailDto,
  values: PriceFormInput,
): PriceCommand {
  const startsAt = new Date(values.startsAt).toISOString();
  const variant = product.variants.find(({ id }) => id === values.variantId);
  if (
    variant?.effectivePriceId
    && variant.effectivePriceVersion !== null
    && variant.effectivePriceVersion !== undefined
  ) {
    return {
      kind: 'replace',
      variantId: values.variantId,
      data: {
        amount: values.amount,
        startsAt,
        expectedCurrentPriceId: variant.effectivePriceId,
        expectedCurrentPriceVersion: variant.effectivePriceVersion,
      },
    };
  }
  return {
    kind: 'create',
    variantId: values.variantId,
    data: { amount: values.amount, startsAt },
  };
}
