# Catalog Products module maintenance note

> **Document version:** 1.0.0
>
> **Last updated:** 2026-09-20
>
> **Change summary:** Ghi aggregate create Product + initial variants atomic và ranh giới workflow Catalog.

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

## Permission, concurrency và lỗi

- Create/update/variant mutation yêu cầu `catalog.product.manage`; publish/archive yêu cầu
  permission lifecycle tương ứng. Backend là security boundary.
- Product/variant lifecycle dùng optimistic version và lock Product khi mutation contested.
- Unique productNo/slug/SKU/barcode trả conflict thống nhất; không để lại SPU dở dang khi
  aggregate create thất bại.

## Checklist khi sửa

- Create request phải có ít nhất một variant và tối đa 50.
- Không đưa `variants` vào generic Product update DTO.
- Giữ Product/Variant/category/audit cùng transaction create.
- Regenerate OpenAPI và Admin SDK sau khi đổi DTO/controller.
- Chạy unit, HTTP E2E catalog và PostgreSQL integration liên quan trước handoff.

## Revision history

| Version | Date | Change summary |
| --- | --- | --- |
| 1.0.0 | 2026-09-20 | Tạo note và aggregate create Product + initial variants atomic. |
