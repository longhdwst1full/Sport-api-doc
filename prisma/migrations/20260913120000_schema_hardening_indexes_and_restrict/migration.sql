BEGIN;

SELECT pg_advisory_xact_lock(hashtext('dctd:schema_hardening_indexes_and_restrict'));

-- 1. Khóa ngoại nghiệp vụ còn thiếu chỉ mục.
--    product_bundles trước đây không có chỉ mục nào; bundle_variant_id là đường
--    tra ngược từ biến thể combo về combo.
CREATE INDEX IF NOT EXISTS "product_bundles_bundle_variant_id_idx"
  ON public.product_bundles("bundle_variant_id");

-- inventory_movements đã có (warehouse_id, product_variant_id, occurred_at) nhưng
-- product_variant_id không phải cột dẫn đầu, nên tra sổ theo SKU xuyên kho phải
-- quét tuần tự.
CREATE INDEX IF NOT EXISTS "inventory_movements_product_variant_id_occurred_at_idx"
  ON public.inventory_movements("product_variant_id", "occurred_at" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "checkout_sessions_warehouse_id_idx"
  ON public.checkout_sessions("warehouse_id");

CREATE INDEX IF NOT EXISTS "checkout_sessions_shipping_rate_id_idx"
  ON public.checkout_sessions("shipping_rate_id");

-- 2. stock_transfer_items là dòng của chứng từ kho, không phải master child.
--    Rule V1: "Transaction/history không cascade delete" — xóa phiếu chuyển mà
--    cascade mất dòng hàng sẽ để lại bút toán TRANSFER_OUT/IN mồ côi và làm lệch sổ.
ALTER TABLE public.stock_transfer_items
  DROP CONSTRAINT IF EXISTS "stock_transfer_items_stock_transfer_id_fkey";

ALTER TABLE public.stock_transfer_items
  ADD CONSTRAINT "stock_transfer_items_stock_transfer_id_fkey"
  FOREIGN KEY ("stock_transfer_id") REFERENCES public.stock_transfers("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
