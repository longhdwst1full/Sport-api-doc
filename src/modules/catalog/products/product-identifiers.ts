import { randomInt, randomUUID } from 'node:crypto';
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

/**
 * SKU tự sinh khi admin bỏ trống: 8 ký tự từ bảng chữ không gây nhầm (~40 bit). Trùng (rất hiếm) bị
 * unique `product_variants.sku` chặn và trả 409 như SKU nhập tay trùng; admin chỉ cần gửi lại.
 */
export const generateSku = (): string => {
  const alphabet = PRODUCT_IDENTIFIER.SKU_GENERATED_ALPHABET;
  return Array.from({ length: PRODUCT_IDENTIFIER.SKU_GENERATED_LENGTH }, () => alphabet[randomInt(alphabet.length)]).join('');
};

/** Chuẩn hoá SKU nhập tay: bỏ khoảng trắng hai đầu, viết hoa. */
export const normalizeSku = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
