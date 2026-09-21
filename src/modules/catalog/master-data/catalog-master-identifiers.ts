import { buildUniqueSlug, slugifyVietnamese } from '../../../common/text/slug';

/** Giới hạn cột `code`/`slug` của brands và categories trong Prisma schema. */
export const MASTER_CODE_MAX_LENGTH = 32;
export const MASTER_SLUG_MAX_LENGTH = 255;

/** Chuỗi thay thế khi tên chỉ gồm ký tự không tạo được slug (ví dụ toàn emoji). */
const SLUG_FALLBACK = 'muc';

export const slugifyMasterName = (value: string): string => slugifyVietnamese(value);

/**
 * Mã nghiệp vụ trùng với slug, chỉ khác cách viết.
 *
 * Người nhập không có cách nào đoán được mã "đúng" là gì, nên bắt họ nghĩ ra một chuỗi thứ hai
 * cho cùng một thứ chỉ tạo ra mã lệch slug rồi không ai sửa lại được nữa.
 */
export const deriveMasterCode = (slug: string): string =>
  slug.toUpperCase().slice(0, MASTER_CODE_MAX_LENGTH).replace(/-+$/g, '');

/**
 * Sinh slug duy nhất từ tên.
 *
 * `taken` là tập slug đã tồn tại trong cùng bảng. Trùng thì nối `-2`, `-3`… thay vì ném lỗi: hai
 * thương hiệu trùng tên là chuyện bình thường, và người nhập không có nghĩa vụ tự nghĩ ra biến thể
 * URL chưa ai dùng.
 */
export function buildUniqueMasterSlug(name: string, taken: Iterable<string>): string {
  return buildUniqueSlug(name, taken, {
    fallback: SLUG_FALLBACK,
    maxLength: MASTER_SLUG_MAX_LENGTH,
  });
}
