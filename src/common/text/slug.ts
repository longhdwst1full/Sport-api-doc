/**
 * Sinh slug từ tên tiếng Việt.
 *
 * Dùng chung cho mọi bảng có cột `slug` (thương hiệu, danh mục, bài viết). Người nhập không có
 * nghĩa vụ tự nghĩ ra một chuỗi URL chưa ai dùng cho cùng một thứ họ vừa đặt tên; bắt nhập tay
 * chỉ tạo ra slug lệch tên rồi không ai sửa lại được nữa.
 */

/** Bỏ dấu, hạ chữ thường, nối bằng `-`. `đ` phải xử lý riêng vì NFD không tách nó ra. */
export const slugifyVietnamese = (value: string): string =>
  value
    .trim()
    .toLocaleLowerCase('vi-VN')
    .replaceAll('đ', 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Slug duy nhất trong phạm vi `taken`.
 *
 * Trùng thì nối `-2`, `-3`… thay vì ném lỗi: hai bài viết hoặc hai thương hiệu trùng tên là
 * chuyện bình thường. `fallback` dùng khi tên không còn ký tự nào tạo được slug (toàn emoji).
 */
export function buildUniqueSlug(
  name: string,
  taken: Iterable<string>,
  options: { fallback: string; maxLength: number },
): string {
  const existing = new Set(taken);
  const base = (slugifyVietnamese(name) || options.fallback).slice(0, options.maxLength);
  if (!existing.has(base)) return base;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const marker = `-${suffix}`;
    const candidate = `${base.slice(0, options.maxLength - marker.length).replace(/-+$/g, '')}${marker}`;
    if (!existing.has(candidate)) return candidate;
  }
  throw new Error(`Cannot derive a unique slug for "${name}"`);
}
