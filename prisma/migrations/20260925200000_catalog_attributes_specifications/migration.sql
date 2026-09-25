-- Thông số kỹ thuật theo decision D61: 1 bảng từ điển `attributes` + `products.specifications` JSONB,
-- thay cho `attribute_values` và `product_attribute_values` trong DBML. Chấp nhận mất FK ở DB vì Catalog
-- sở hữu cả hai phần và quy mô nhỏ; Catalog service kiểm code/kiểu/lựa chọn trước mọi lần ghi.
-- Chỉ thêm bảng/cột mới, không đổi dữ liệu hiện có.

CREATE TABLE "attributes" (
  "id" BIGSERIAL PRIMARY KEY,
  "code" VARCHAR(64) NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "data_type" VARCHAR(24) NOT NULL,
  "unit" VARCHAR(16),
  "is_variant_axis" BOOLEAN NOT NULL DEFAULT false,
  "options" JSONB,
  "status" VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "version" BIGINT NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  -- CHECK: giá trị phải khớp hằng số trong src/modules/catalog/attributes/attribute.constants.ts.
  CONSTRAINT "attributes_code_format_check" CHECK ("code" ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  CONSTRAINT "attributes_data_type_check" CHECK ("data_type" IN ('TEXT', 'NUMBER', 'BOOLEAN', 'OPTION')),
  CONSTRAINT "attributes_status_check" CHECK ("status" IN ('ACTIVE', 'INACTIVE')),
  CONSTRAINT "attributes_options_check" CHECK (
    ("data_type" = 'OPTION' AND jsonb_typeof("options") = 'array')
    OR ("data_type" <> 'OPTION' AND "options" IS NULL)
  )
);

CREATE UNIQUE INDEX "attributes_code_key" ON "attributes"("code");
CREATE INDEX "attributes_status_sort_order_idx" ON "attributes"("status", "sort_order");

ALTER TABLE "products"
  ADD COLUMN "specifications" JSONB NOT NULL DEFAULT '[]',
  ADD CONSTRAINT "products_specifications_array_check" CHECK (jsonb_typeof("specifications") = 'array');
