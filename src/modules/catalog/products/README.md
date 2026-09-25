# Catalog Products module maintenance note

> **Document version:** 1.2.0
>
> **Last updated:** 2026-09-25
>
> **Change summary:** `createAdminProduct` idempotent theo `x-request-id` + audit, có advisory lock và 409 khi khác payload/người/thao tác.

## Phạm vi và entrypoint

Module sở hữu Product, ProductVariant/SKU, bundle definition, product price và product media
link. Admin HTTP entry nằm ở `controllers/admin-products.controller.ts`; Storefront read entry
nằm ở `controllers/catalog.controller.ts`. `ProductsService` sở hữu product/variant/price/
bundle use case; `ProductMediaService` sở hữu media link lifecycle.

## Source of truth và persistence

- Prisma: `products`, `product_variants`, `product_categories`, `product_bundles`,
  `bundle_items`, `product_prices`, `product_media`.
- Product là SPU; ProductVariant là sellable SKU. SKU/productNo/slug do Backend tự sinh và
  bất biến theo business rule.
- Nest DTO/controller là OpenAPI producer; Admin/Client chỉ consume SDK generate.

## Invariant tạo sản phẩm

- `createAdminProduct` nhận thông tin Product và 1–50 initial variants.
- Product, category links, toàn bộ initial variants và audit ghi trong một Prisma transaction.
  Bất kỳ category/barcode/SKU/audit write lỗi đều rollback toàn aggregate.
- Mỗi variant có audit sequence riêng; Product audit chỉ snapshot `variantCount`, không lặp
  toàn bộ payload SKU.
- `createAdminProductVariant` vẫn tồn tại để thêm SKU sau khi Product đang DRAFT.
- Update Product không nhận `variants`; SKU dùng operation lifecycle/update riêng.

## Idempotency tạo sản phẩm

- Khoá là header `x-request-id` (tuỳ chọn, ≤100 ký tự). Admin giữ một UUID cố định cho mỗi lần mở
  form tạo; bỏ trống thì server tự sinh id và mỗi lần gọi là một lần tạo mới.
- Không có cột riêng: kết quả lưu là audit `catalog.product.create` của request đó, `after_json.idempotency`
  chứa `fingerprintVersion` và `requestHash` = SHA-256(thao tác + method + actor + payload, key sắp xếp).
- Transaction lấy `pg_advisory_xact_lock(hashtextextended('catalog.product.create:<id>', 0))` trước khi tra
  audit qua `AuditReader`. Unique `(request_id, sequence_no)` của audit **không** đủ vì `AuditWriter` tự cấp
  `MAX + 1`; lock mới là thứ bắt các request cùng id chạy tuần tự.
- Cùng id + cùng hash → trả sản phẩm hiện tại, không ghi gì. Id đã gắn với thao tác khác, khác actor,
  khác payload hoặc khác `fingerprintVersion` → 409 `PRODUCT_IDEMPOTENCY_CONFLICT`.
- Phụ thuộc: audit tạo sản phẩm phải ghi đồng bộ trong cùng transaction. Chuyển audit sang ghi bất đồng
  bộ/outbox sẽ làm mất idempotency; khi đó cần kho khoá riêng.
- Chỉ bao phủ bước tạo Product + SKU. Tồn đầu có khoá riêng; giá và ảnh gọi sau vẫn chưa idempotent.

## Permission, concurrency và lỗi

- Create/update/variant mutation yêu cầu `catalog.product.manage`; publish/archive yêu cầu
  permission lifecycle tương ứng. Backend là security boundary.
- Product/variant lifecycle dùng optimistic version và lock Product khi mutation contested.
- Unique productNo/slug/SKU/barcode trả conflict thống nhất; không để lại SPU dở dang khi
  aggregate create thất bại.

## Xóa ảnh sản phẩm

- `archiveAdminProductMedia` chỉ chuyển liên kết `product_media` sang `INACTIVE` và giữ asset.
- `deleteAdminProductMedia` chỉ xóa khi asset không còn được Product, Brand, Category, Content
  Post hoặc Payment Evidence khác sử dụng.
- DELETE khóa theo thứ tự Product → MediaAsset, chuyển asset sang `DELETE_PENDING`, gỡ link và
  commit trước khi gọi Cloudinary để không giữ database transaction trong lúc chờ HTTP.
- Cloudinary `destroy` dùng `invalidate=true`. Thành công chuyển asset sang `INACTIVE`; lỗi provider
  khôi phục asset/link, tăng Product version và ghi audit để client reload snapshot.
- `DELETE_PENDING` còn tồn sau process crash là dấu hiệu cần reconciliation/cleanup job; không được
  tự đổi sang `ACTIVE` nếu chưa xác minh provider asset còn tồn tại.

## Checklist khi sửa

- Create request phải có ít nhất một variant và tối đa 50.
- Đổi payload/cách hash của create thì tăng `PRODUCT_CREATE_IDEMPOTENCY.FINGERPRINT_VERSION`.
- Không đưa `variants` vào generic Product update DTO.
- Giữ Product/Variant/category/audit cùng transaction create.
- Regenerate OpenAPI và Admin SDK sau khi đổi DTO/controller.
- Test provider success, shared-usage conflict và compensation khi provider lỗi.
- Chạy unit, HTTP E2E catalog và PostgreSQL integration liên quan trước handoff.

## Revision history

| Version | Date | Change summary |
| --- | --- | --- |
| 1.2.0 | 2026-09-25 | createAdminProduct idempotent theo x-request-id + audit, advisory lock, 409 PRODUCT_IDEMPOTENCY_CONFLICT. |
| 1.1.0 | 2026-09-21 | DELETE Product Media gọi Cloudinary, chặn asset dùng chung và compensation khi provider lỗi. |
| 1.0.0 | 2026-09-20 | Tạo note và aggregate create Product + initial variants atomic. |
