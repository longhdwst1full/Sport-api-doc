BEGIN;

SELECT pg_advisory_xact_lock(hashtext('dctd:flash_sale_foundation'));

-- S6.4 Flash Sale — campaign, item quota và quota reservation.
--
-- Quota flash KHÔNG thay thế inventory reservation vật lý. Checkout phải giành
-- được cả quota lẫn tồn kho trong cùng một transaction hoặc rollback cả hai.

CREATE TABLE "flash_sale_campaigns" (
  "id"          BIGSERIAL PRIMARY KEY,
  "code"        VARCHAR(32)  NOT NULL,
  "name"        VARCHAR(255) NOT NULL,
  "description" TEXT,
  "starts_at"   TIMESTAMPTZ(6) NOT NULL,
  "ends_at"     TIMESTAMPTZ(6) NOT NULL,
  "status"      VARCHAR(24)  NOT NULL DEFAULT 'DRAFT',
  "version"     BIGINT       NOT NULL DEFAULT 0,
  "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by"  BIGINT       NOT NULL,
  "updated_at"  TIMESTAMPTZ(6) NOT NULL,
  "updated_by"  BIGINT       NOT NULL
);

CREATE UNIQUE INDEX "flash_sale_campaigns_code_key" ON "flash_sale_campaigns"("code");
CREATE INDEX "flash_sale_campaigns_status_starts_at_ends_at_idx"
  ON "flash_sale_campaigns"("status", "starts_at", "ends_at");

-- Cửa sổ chạy phải hợp lệ ở tầng database, không chỉ ở service.
ALTER TABLE "flash_sale_campaigns"
  ADD CONSTRAINT "flash_sale_campaigns_window_check" CHECK ("ends_at" > "starts_at");

ALTER TABLE "flash_sale_campaigns"
  ADD CONSTRAINT "flash_sale_campaigns_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "flash_sale_campaigns"
  ADD CONSTRAINT "flash_sale_campaigns_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "flash_sale_items" (
  "id"                 BIGSERIAL PRIMARY KEY,
  "campaign_id"        BIGINT        NOT NULL,
  "product_variant_id" BIGINT        NOT NULL,
  "sale_price"         DECIMAL(19,2) NOT NULL,
  "currency_code"      CHAR(3)       NOT NULL DEFAULT 'VND',
  "quota"              INTEGER       NOT NULL,
  "sold_quantity"      INTEGER       NOT NULL DEFAULT 0,
  "reserved_quantity"  INTEGER       NOT NULL DEFAULT 0,
  "per_customer_limit" INTEGER,
  "status"             VARCHAR(24)   NOT NULL DEFAULT 'ACTIVE',
  "version"            BIGINT        NOT NULL DEFAULT 0,
  "created_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"         TIMESTAMPTZ(6) NOT NULL
);

CREATE UNIQUE INDEX "flash_sale_items_campaign_id_product_variant_id_key"
  ON "flash_sale_items"("campaign_id", "product_variant_id");
CREATE INDEX "flash_sale_items_product_variant_id_status_idx"
  ON "flash_sale_items"("product_variant_id", "status");

-- Bất biến chống oversell nằm ở database: dù service có lỗi thì quota vẫn không
-- bị vượt và các cột đếm không âm.
ALTER TABLE "flash_sale_items"
  ADD CONSTRAINT "flash_sale_items_quota_positive_check" CHECK ("quota" > 0),
  ADD CONSTRAINT "flash_sale_items_counters_non_negative_check"
    CHECK ("sold_quantity" >= 0 AND "reserved_quantity" >= 0),
  ADD CONSTRAINT "flash_sale_items_quota_not_exceeded_check"
    CHECK ("sold_quantity" + "reserved_quantity" <= "quota"),
  ADD CONSTRAINT "flash_sale_items_sale_price_positive_check" CHECK ("sale_price" > 0),
  ADD CONSTRAINT "flash_sale_items_per_customer_limit_check"
    CHECK ("per_customer_limit" IS NULL OR "per_customer_limit" > 0);

ALTER TABLE "flash_sale_items"
  ADD CONSTRAINT "flash_sale_items_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "flash_sale_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "flash_sale_items"
  ADD CONSTRAINT "flash_sale_items_product_variant_id_fkey"
  FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "flash_sale_quota_reservations" (
  "id"                  BIGSERIAL PRIMARY KEY,
  "flash_sale_item_id"  BIGINT       NOT NULL,
  "checkout_session_id" BIGINT       NOT NULL,
  "customer_key"        VARCHAR(150) NOT NULL,
  "idempotency_key"     VARCHAR(150) NOT NULL,
  "quantity"            INTEGER      NOT NULL,
  "status"              VARCHAR(24)  NOT NULL DEFAULT 'ACTIVE',
  "expires_at"          TIMESTAMPTZ(6) NOT NULL,
  "committed_at"        TIMESTAMPTZ(6),
  "released_at"         TIMESTAMPTZ(6),
  "release_reason"      VARCHAR(500),
  "version"             BIGINT       NOT NULL DEFAULT 0,
  "created_at"          TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMPTZ(6) NOT NULL
);

CREATE UNIQUE INDEX "flash_sale_quota_reservations_idempotency_key_key"
  ON "flash_sale_quota_reservations"("idempotency_key");
-- Một checkout session chỉ giữ quota một lần cho mỗi item; retry không nhân đôi.
CREATE UNIQUE INDEX "flash_sale_quota_reservations_item_session_key"
  ON "flash_sale_quota_reservations"("flash_sale_item_id", "checkout_session_id");
CREATE INDEX "flash_sale_quota_reservations_status_expires_at_id_idx"
  ON "flash_sale_quota_reservations"("status", "expires_at", "id");
CREATE INDEX "flash_sale_quota_reservations_checkout_session_id_status_idx"
  ON "flash_sale_quota_reservations"("checkout_session_id", "status");

ALTER TABLE "flash_sale_quota_reservations"
  ADD CONSTRAINT "flash_sale_quota_reservations_quantity_positive_check" CHECK ("quantity" > 0);

ALTER TABLE "flash_sale_quota_reservations"
  ADD CONSTRAINT "flash_sale_quota_reservations_flash_sale_item_id_fkey"
  FOREIGN KEY ("flash_sale_item_id") REFERENCES "flash_sale_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "flash_sale_quota_reservations"
  ADD CONSTRAINT "flash_sale_quota_reservations_checkout_session_id_fkey"
  FOREIGN KEY ("checkout_session_id") REFERENCES "checkout_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS deny-by-default cho cả ba bảng; truy cập đi qua service role của API.
ALTER TABLE "flash_sale_campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "flash_sale_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "flash_sale_quota_reservations" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE
  "flash_sale_campaigns", "flash_sale_items", "flash_sale_quota_reservations"
  FROM anon, authenticated;

COMMIT;
