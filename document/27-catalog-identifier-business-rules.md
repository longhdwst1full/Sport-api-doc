# Catalog identifier business rules

> **Document version:** 1.1.0
>
> **Last updated:** 2026-09-25
>
> **Change summary:** BR-SKU-02: SKU là mã hàng của cửa hàng — admin nhập tay (có validate) hoặc bỏ trống để backend sinh mã ngắn 8 ký tự; vẫn unique và immutable.

## Quy tắc đã chốt

| Rule | Quy tắc | API enforcement | Database enforcement |
| --- | --- | --- | --- |
| BR-PRODUCT-01 | `product_no` do backend tự sinh khi create, unique và immutable. | Request create/update không nhận `productNo`. | `products.product_no NOT NULL UNIQUE`. |
| BR-PRODUCT-02 | `slug` do backend sinh từ `name` + `product_no` khi create và unique. Đổi `name` không tự đổi slug. Chỉ được sửa slug lúc `DRAFT`; sau publish bị khóa. | Create không nhận `slug`; update từ trạng thái khác `DRAFT` trả 422 nếu đổi slug. | `products.slug NOT NULL UNIQUE`. |
| BR-SKU-01 | `ProductVariant` là đơn vị bán được (Sellable SKU); giá và tồn kho gắn với variant. | Catalog/storefront trả variant đủ điều kiện bán. | Price/inventory FK tới `product_variants.id`. |
| BR-SKU-02 | `sku` là mã hàng của cửa hàng: admin nhập khi tạo variant, hoặc bỏ trống để backend sinh. Unique và immutable. | Create nhận `sku` tuỳ chọn (tự viết hoa, `^[A-Z0-9][A-Z0-9._+-]{1,39}$`, không trùng trong cùng request); update không nhận `sku`. Trùng với SKU đã có → 409. | `product_variants.sku NOT NULL UNIQUE`. |

## Format V1

- `product_no`: `PRD-` + 24 ký tự hexadecimal viết hoa; ví dụ `PRD-A12F89CDB57041D5AFA89C20`.
- `slug`: slug hóa tên tiếng Việt và nối `product_no` viết thường; ví dụ `Giày chạy bộ địa hình` → `giay-chay-bo-dia-hinh-prd-a12f89cdb57041d5afa89c20`.
- `sku` nhập tay: mã cửa hàng đang dùng, ví dụ `TD-02`, `V-40+`, `OLD-SAKURA-HQ-V2C`.
- `sku` tự sinh: 8 ký tự từ `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (bỏ 0/O/1/I); ví dụ `K7M3QX9A`.
  Trước 2026-09-25 mã tự sinh là `{product_no}-SKU-` + 20 hex (53 ký tự); 4 SKU dạng này vẫn giữ nguyên vì SKU immutable.

Lý do đổi (dữ liệu 2026-09-25): 618/619 sản phẩm chỉ có 1 SKU và 616 SKU hiện có là mã cửa hàng dài
trung bình 7 ký tự, nên SKU thực tế chính là mã sản phẩm dùng để in tem, gõ ở quầy và đọc qua điện thoại.

Unique constraint trong PostgreSQL là lớp xác nhận cuối cùng. Audit create lưu cả identifier backend đã sinh. Seed/import nội bộ có thể ghi business key tường minh để hội tụ dữ liệu. API quản trị không cho client quyết định `product_no`/`slug`; riêng `sku` được nhập khi tạo.

## Luồng và lỗi

1. Admin gửi tên, loại, thương hiệu và danh mục để tạo Product.
2. Backend sinh `product_no`, tạo `slug`, ghi Product + category + audit trong cùng transaction.
3. Admin gửi tên phiên bản, SKU và barcode tùy chọn để tạo ProductVariant.
4. Backend dùng SKU admin nhập hoặc sinh mã ngắn, ghi variant + audit trong cùng transaction.
5. Nếu unique constraint hiếm khi xung đột, API trả lỗi conflict và không ghi dở dữ liệu.
6. Đổi tên Product không làm đổi URL. Admin chỉ có thể sửa slug trước publish.

## Revision history

| Version | Date | Change summary | Source / Change ID |
| --- | --- | --- | --- |
| 1.1.0 | 2026-09-25 | BR-SKU-02: SKU nhập tay có validate hoặc mã ngắn 8 ký tự tự sinh. | API-20260925-SKU-MANUAL-SHORT |
| 1.0.0 | 2026-09-07 | Ban hành BR-PRODUCT-01/02 và BR-SKU-01/02. | API-20260907-CATALOG-AUTO-IDENTIFIERS |
