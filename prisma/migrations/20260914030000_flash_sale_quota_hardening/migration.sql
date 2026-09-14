BEGIN;

SELECT pg_advisory_xact_lock(hashtext('dctd:flash_sale_quota_hardening'));

-- Sửa ba lỗi quota flash sale (document/35-flash-sale-quota-hardening-plan.md).
--
-- Gốc của cả ba: báo giá và giữ quota là hai nhánh độc lập, dùng hai quy tắc
-- chọn campaign khác nhau trên hai tập variant khác nhau.
--
-- L1 Combo được giảm giá nhưng không trừ quota: báo giá nhìn variant combo,
--    giữ quota nhận variant linh kiện đã tách.
-- L2 Một SKU ở hai campaign thì trừ quota cả hai cho cùng một lần mua.
-- L3 Báo giá lấy campaign rẻ nhất, giữ quota lấy campaign tạo trước.

-- 1. Ghi lại ĐÚNG suất flash đã dùng để báo giá.
--    Nullable: dòng không có khuyến mãi và các checkout đang mở dở lúc deploy
--    đều để trống, xử như không có flash sale và giữ nguyên giá đã snapshot.
ALTER TABLE "checkout_session_items"
  ADD COLUMN "flash_sale_item_id" BIGINT;

ALTER TABLE "checkout_session_items"
  ADD CONSTRAINT "checkout_session_items_flash_sale_item_id_fkey"
  FOREIGN KEY ("flash_sale_item_id") REFERENCES "flash_sale_items"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "checkout_session_items_flash_sale_item_id_idx"
  ON "checkout_session_items"("flash_sale_item_id");

-- 2. Một checkout chỉ được giữ quota MỘT lần cho mỗi biến thể.
--    Ràng buộc cũ chỉ trên (flash_sale_item_id, checkout_session_id) nên không
--    chặn được L2: hai campaign là hai item khác nhau, cùng lọt.
--    Cần cột phụ vì bảng quota không biết variant; lấy từ flash_sale_items.
ALTER TABLE "flash_sale_quota_reservations"
  ADD COLUMN "product_variant_id" BIGINT;

UPDATE "flash_sale_quota_reservations" reservation
SET "product_variant_id" = item."product_variant_id"
FROM "flash_sale_items" item
WHERE item."id" = reservation."flash_sale_item_id";

ALTER TABLE "flash_sale_quota_reservations"
  ALTER COLUMN "product_variant_id" SET NOT NULL;

ALTER TABLE "flash_sale_quota_reservations"
  ADD CONSTRAINT "flash_sale_quota_reservations_product_variant_id_fkey"
  FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "flash_sale_quota_reservations_session_variant_key"
  ON "flash_sale_quota_reservations"("checkout_session_id", "product_variant_id");

-- 3. Giới hạn mỗi khách phải cộng dồn qua nhiều lần đặt, không chỉ một lần.
--    Không có chỉ mục này thì truy vấn cộng dồn quét toàn bảng.
CREATE INDEX "flash_sale_quota_reservations_customer_key_item_status_idx"
  ON "flash_sale_quota_reservations"("customer_key", "flash_sale_item_id", "status");

COMMIT;
