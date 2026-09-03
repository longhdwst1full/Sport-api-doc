CREATE TABLE "inventory_balances" (
  "id" UUID NOT NULL,
  "warehouse_id" UUID NOT NULL,
  "product_variant_id" UUID NOT NULL,
  "on_hand" INTEGER NOT NULL DEFAULT 0,
  "reserved" INTEGER NOT NULL DEFAULT 0,
  "reorder_point" INTEGER NOT NULL DEFAULT 0,
  "version" BIGINT NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_balances_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_balances_non_negative_check"
    CHECK ("on_hand" >= 0 AND "reserved" >= 0 AND "reorder_point" >= 0 AND "reserved" <= "on_hand")
);

CREATE UNIQUE INDEX "inventory_balances_warehouse_id_product_variant_id_key"
  ON "inventory_balances"("warehouse_id", "product_variant_id");
CREATE INDEX "inventory_balances_product_variant_id_idx"
  ON "inventory_balances"("product_variant_id");

CREATE TABLE "stock_adjustments" (
  "id" UUID NOT NULL,
  "adjustment_no" VARCHAR(32) NOT NULL,
  "warehouse_id" UUID NOT NULL,
  "adjustment_type" VARCHAR(32) NOT NULL DEFAULT 'CORRECTION',
  "reason_code" VARCHAR(64) NOT NULL DEFAULT 'MANUAL',
  "reason" TEXT NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'POSTED',
  "idempotency_key" VARCHAR(150) NOT NULL,
  "request_hash" CHAR(64) NOT NULL,
  "result_json" JSONB NOT NULL,
  "created_by" UUID NOT NULL,
  "posted_at" TIMESTAMPTZ(6) NOT NULL,
  "version" BIGINT NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_adjustments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_adjustments_status_check" CHECK ("status" = 'POSTED')
);

CREATE UNIQUE INDEX "stock_adjustments_adjustment_no_key" ON "stock_adjustments"("adjustment_no");
CREATE UNIQUE INDEX "stock_adjustments_idempotency_key_key" ON "stock_adjustments"("idempotency_key");
CREATE INDEX "stock_adjustments_warehouse_id_posted_at_idx" ON "stock_adjustments"("warehouse_id", "posted_at");

CREATE TABLE "stock_adjustment_items" (
  "id" UUID NOT NULL,
  "stock_adjustment_id" UUID NOT NULL,
  "product_variant_id" UUID NOT NULL,
  "quantity_delta" INTEGER NOT NULL,
  "expected_on_hand" INTEGER NOT NULL,
  "actual_on_hand" INTEGER NOT NULL,
  "note" TEXT,
  CONSTRAINT "stock_adjustment_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_adjustment_items_quantity_delta_check" CHECK ("quantity_delta" <> 0),
  CONSTRAINT "stock_adjustment_items_balance_check" CHECK ("expected_on_hand" >= 0 AND "actual_on_hand" >= 0)
);

CREATE UNIQUE INDEX "stock_adjustment_items_stock_adjustment_id_product_variant_id_key"
  ON "stock_adjustment_items"("stock_adjustment_id", "product_variant_id");
CREATE INDEX "stock_adjustment_items_product_variant_id_idx"
  ON "stock_adjustment_items"("product_variant_id");

CREATE TABLE "inventory_movements" (
  "id" UUID NOT NULL,
  "warehouse_id" UUID NOT NULL,
  "product_variant_id" UUID NOT NULL,
  "movement_type" VARCHAR(40) NOT NULL,
  "quantity_delta" INTEGER NOT NULL,
  "balance_after" INTEGER NOT NULL,
  "reference_type" VARCHAR(64) NOT NULL,
  "reference_id" UUID NOT NULL,
  "idempotency_key" VARCHAR(200) NOT NULL,
  "reason" TEXT NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID NOT NULL,
  CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_movements_quantity_delta_check" CHECK ("quantity_delta" <> 0),
  CONSTRAINT "inventory_movements_balance_after_check" CHECK ("balance_after" >= 0)
);

CREATE UNIQUE INDEX "inventory_movements_idempotency_key_key" ON "inventory_movements"("idempotency_key");
CREATE INDEX "inventory_movements_warehouse_id_product_variant_id_occurred_at_idx"
  ON "inventory_movements"("warehouse_id", "product_variant_id", "occurred_at");
CREATE INDEX "inventory_movements_reference_type_reference_id_idx"
  ON "inventory_movements"("reference_type", "reference_id");

ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_warehouse_id_fkey"
  FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_product_variant_id_fkey"
  FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_warehouse_id_fkey"
  FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_adjustment_items" ADD CONSTRAINT "stock_adjustment_items_stock_adjustment_id_fkey"
  FOREIGN KEY ("stock_adjustment_id") REFERENCES "stock_adjustments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_adjustment_items" ADD CONSTRAINT "stock_adjustment_items_product_variant_id_fkey"
  FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_warehouse_id_fkey"
  FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_variant_id_fkey"
  FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "reject_inventory_movement_mutation"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'inventory_movements is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "inventory_movements_no_update_or_delete"
BEFORE UPDATE OR DELETE ON "inventory_movements"
FOR EACH ROW EXECUTE FUNCTION "reject_inventory_movement_mutation"();

CREATE TRIGGER "inventory_movements_no_truncate"
BEFORE TRUNCATE ON "inventory_movements"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_inventory_movement_mutation"();
