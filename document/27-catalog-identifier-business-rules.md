# Catalog identifier business rules

> **Document version:** 1.0.0
>
> **Last updated:** 2026-09-07
>
> **Change summary:** Chốt quyền sở hữu, cách sinh, uniqueness và immutability của `product_no`, `slug` và `sku`.

## Quy tắc đã chốt

| Rule | Quy tắc | API enforcement | Database enforcement |
| --- | --- | --- | --- |
| BR-PRODUCT-01 | `product_no` do backend tự sinh khi create, unique và immutable. | Request create/update không nhận `productNo`. | `products.product_no NOT NULL UNIQUE`. |
| BR-PRODUCT-02 | `slug` do backend sinh từ `name` + `product_no` khi create và unique. Đổi `name` không tự đổi slug. Chỉ được sửa slug lúc `DRAFT`; sau publish bị khóa. | Create không nhận `slug`; update từ trạng thái khác `DRAFT` trả 422 nếu đổi slug. | `products.slug NOT NULL UNIQUE`. |
| BR-SKU-01 | `ProductVariant` là đơn vị bán được (Sellable SKU); giá và tồn kho gắn với variant. | Catalog/storefront trả variant đủ điều kiện bán. | Price/inventory FK tới `product_variants.id`. |
| BR-SKU-02 | `sku` do backend tự sinh khi create variant, unique và immutable. | Request create/update variant không nhận `sku`. | `product_variants.sku NOT NULL UNIQUE`. |

## Format V1

- `product_no`: `PRD-` + 24 ký tự hexadecimal viết hoa; ví dụ `PRD-A12F89CDB57041D5AFA89C20`.
- `slug`: slug hóa tên tiếng Việt và nối `product_no` viết thường; ví dụ `Giày chạy bộ địa hình` → `giay-chay-bo-dia-hinh-prd-a12f89cdb57041d5afa89c20`.
- `sku`: `{product_no}-SKU-` + 20 ký tự hexadecimal viết hoa; ví dụ `PRD-A12F89CDB57041D5AFA89C20-SKU-874CBD31F6244FC9A401`.

Unique constraint trong PostgreSQL là lớp xác nhận cuối cùng. Audit create lưu cả identifier backend đã sinh. Seed/import nội bộ có thể ghi business key tường minh để hội tụ dữ liệu, nhưng API quản trị không cho client quyết định các identifier này.

## Luồng và lỗi

1. Admin gửi tên, loại, thương hiệu và danh mục để tạo Product.
2. Backend sinh `product_no`, tạo `slug`, ghi Product + category + audit trong cùng transaction.
3. Admin gửi tên phiên bản và barcode tùy chọn để tạo ProductVariant.
4. Backend sinh `sku`, ghi variant + audit trong cùng transaction.
5. Nếu unique constraint hiếm khi xung đột, API trả lỗi conflict và không ghi dở dữ liệu.
6. Đổi tên Product không làm đổi URL. Admin chỉ có thể sửa slug trước publish.

## Revision history

| Version | Date | Change summary | Source / Change ID |
| --- | --- | --- | --- |
| 1.0.0 | 2026-09-07 | Ban hành BR-PRODUCT-01/02 và BR-SKU-01/02. | API-20260907-CATALOG-AUTO-IDENTIFIERS |
