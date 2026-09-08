import { randomUUID } from 'node:crypto';
import { PRODUCT_IDENTIFIER } from './product.constants';

const randomToken = (length: number): string =>
  randomUUID().replaceAll('-', '').slice(0, length).toUpperCase();

const slugify = (value: string): string =>
  value
    .trim()
    .toLocaleLowerCase('vi-VN')
    .replaceAll('đ', 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const generateProductNo = (): string =>
  `${PRODUCT_IDENTIFIER.PRODUCT_NO_PREFIX}-${randomToken(PRODUCT_IDENTIFIER.PRODUCT_NO_RANDOM_LENGTH)}`;

export const generateProductSlug = (name: string, productNo: string): string => {
  const suffix = productNo.toLowerCase();
  const maximumNameLength = PRODUCT_IDENTIFIER.MAX_SLUG_LENGTH - suffix.length - 1;
  const nameSlug = (slugify(name) || 'san-pham').slice(0, maximumNameLength).replace(/-+$/g, '');
  return `${nameSlug}-${suffix}`;
};

export const generateSku = (productNo: string): string =>
  `${productNo}-${PRODUCT_IDENTIFIER.SKU_PREFIX}-${randomToken(PRODUCT_IDENTIFIER.SKU_RANDOM_LENGTH)}`;
