# Catalog Attributes module maintenance note

> **Document version:** 1.0.0
>
> **Last updated:** 2026-09-25
>
> **Change summary:** Tạo từ điển thuộc tính và thông số kỹ thuật sản phẩm theo decision D61.

## Phạm vi

- Từ điển `attributes` (TEXT / NUMBER / BOOLEAN / OPTION, `unit`, `options` JSONB cho OPTION).
- Kiểm tra và ghép nhãn cho `products.specifications` (`[{ code, values[] }]`).
- Ngoài phạm vi: trục biến thể/ma trận SKU (Option) — sẽ dùng bảng liên kết `variant_attribute_values`,
  không dùng JSONB làm khoá tổ hợp; thông số KHÔNG sinh SKU.

## Entry point

- `attributes.controller.ts`: `listAdminAttributes`, `createAdminAttribute`, `updateAdminAttribute`
  (quyền `catalog.product.view` / `catalog.product.manage`; không có endpoint xoá).
- `AttributesService` được `ProductsService` dùng cho `replaceAdminProductSpecifications` và để ghép
  `specifications` vào `ProductDetailDto` (admin + storefront).

## Invariant (D61 — không có FK từ JSONB tới attributes)

- `code` bất biến; không xoá cứng, ngừng dùng bằng `INACTIVE` (thông số cũ vẫn hiện nhãn).
- Mọi lần ghi `products.specifications` phải qua `validateSpecifications`: đúng kiểu, lựa chọn có trong
  `options`, không trùng thuộc tính/giá trị; thuộc tính INACTIVE chỉ được giữ nguyên giá trị cũ.
- JSONB chỉ chứa giá trị; nhãn và đơn vị lấy từ từ điển lúc đọc.
- Không đổi `unit` của NUMBER và không bỏ lựa chọn khi đã có sản phẩm dùng (409 `ATTRIBUTE_IN_USE`,
  kiểm bằng toán tử `@>` trên `products.specifications`).
- Chưa có GIN index; thêm khi có filter thật trên storefront.

## Transaction / concurrency

- Sửa định nghĩa: khoá dòng `attributes` + `expectedVersion`.
- Ghi thông số: khoá sản phẩm, kiểm `expectedVersion`, tăng version, audit before/after cùng transaction.

## Test / evidence

- Unit: `attributes.service.spec.ts`.
- PostgreSQL e2e: `test/admin-contract.e2e-spec.ts` (ca "stores TD-02 specifications…").

## Revision history

| Version | Date | Change summary |
| --- | --- | --- |
| 1.0.0 | 2026-09-25 | Tạo module theo D61. |
