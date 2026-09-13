ALTER TABLE "public"."order_status_history"
  ADD COLUMN "idempotency_key" VARCHAR(150),
  ADD COLUMN "request_hash" CHAR(64);

ALTER TABLE "public"."order_status_history"
  ADD CONSTRAINT "order_status_history_request_hash_pair_check"
  CHECK (
    ("idempotency_key" IS NULL AND "request_hash" IS NULL)
    OR ("idempotency_key" IS NOT NULL AND "request_hash" IS NOT NULL)
  );

CREATE UNIQUE INDEX "order_status_history_order_id_idempotency_key_key"
  ON "public"."order_status_history" ("order_id", "idempotency_key");
