BEGIN;

ALTER TABLE "products"
  ADD COLUMN "product_type" VARCHAR(24) NOT NULL DEFAULT 'STANDARD';

-- Existing products that already own at least one bundle definition are combos.
UPDATE "products" AS product
SET "product_type" = 'BUNDLE'
WHERE EXISTS (
  SELECT 1
  FROM "product_variants" AS variant
  JOIN "product_bundles" AS bundle ON bundle."bundle_variant_id" = variant."id"
  WHERE variant."product_id" = product."id"
);

ALTER TABLE "products"
  ADD CONSTRAINT "products_type_check"
  CHECK ("product_type" IN ('STANDARD', 'BUNDLE'));

ALTER TABLE "product_prices"
  DROP CONSTRAINT "product_prices_amount_check";

ALTER TABLE "product_prices"
  ADD CONSTRAINT "product_prices_amount_check" CHECK ("amount" > 0);

COMMIT;
