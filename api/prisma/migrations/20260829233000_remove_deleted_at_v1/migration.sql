BEGIN;

-- Preserve lifecycle meaning before removing soft-delete timestamps.
UPDATE "branches" SET "status" = 'INACTIVE' WHERE "deleted_at" IS NOT NULL;
UPDATE "warehouses" SET "status" = 'INACTIVE' WHERE "deleted_at" IS NOT NULL;
UPDATE "users" SET "status" = 'INACTIVE' WHERE "deleted_at" IS NOT NULL;
UPDATE "roles" SET "status" = 'INACTIVE' WHERE "deleted_at" IS NOT NULL;
UPDATE "media_assets" SET "status" = 'INACTIVE' WHERE "deleted_at" IS NOT NULL;
UPDATE "brands" SET "status" = 'INACTIVE' WHERE "deleted_at" IS NOT NULL;
UPDATE "categories" SET "status" = 'INACTIVE' WHERE "deleted_at" IS NOT NULL;
UPDATE "products" SET "status" = 'ARCHIVED' WHERE "deleted_at" IS NOT NULL;
UPDATE "product_variants" SET "status" = 'INACTIVE' WHERE "deleted_at" IS NOT NULL;
UPDATE "product_media" SET "status" = 'INACTIVE' WHERE "deleted_at" IS NOT NULL;

-- Deleted rows could previously reuse these identifiers. Stop instead of choosing a survivor implicitly.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "users"
    WHERE "normalized_email" IS NOT NULL
    GROUP BY "normalized_email" HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot remove users.deleted_at: duplicate normalized_email values require manual resolution';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "users"
    WHERE "normalized_phone" IS NOT NULL
    GROUP BY "normalized_phone" HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot remove users.deleted_at: duplicate normalized_phone values require manual resolution';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "product_variants"
    WHERE "barcode" IS NOT NULL
    GROUP BY "barcode" HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot remove product_variants.deleted_at: duplicate barcode values require manual resolution';
  END IF;
END $$;

DROP INDEX IF EXISTS "users_active_normalized_email_key";
DROP INDEX IF EXISTS "users_active_normalized_phone_key";
DROP INDEX IF EXISTS "product_variants_active_barcode_key";
DROP INDEX IF EXISTS "product_media_product_primary_key";
DROP INDEX IF EXISTS "product_media_variant_primary_key";

CREATE UNIQUE INDEX "users_normalized_email_key"
  ON "users"("normalized_email") WHERE "normalized_email" IS NOT NULL;
CREATE UNIQUE INDEX "users_normalized_phone_key"
  ON "users"("normalized_phone") WHERE "normalized_phone" IS NOT NULL;
CREATE UNIQUE INDEX "product_variants_barcode_key"
  ON "product_variants"("barcode") WHERE "barcode" IS NOT NULL;
CREATE UNIQUE INDEX "product_media_product_primary_key"
  ON "product_media"("product_id")
  WHERE "variant_id" IS NULL AND "is_primary" AND "status" = 'ACTIVE';
CREATE UNIQUE INDEX "product_media_variant_primary_key"
  ON "product_media"("variant_id")
  WHERE "variant_id" IS NOT NULL AND "is_primary" AND "status" = 'ACTIVE';

ALTER TABLE "branches" DROP COLUMN "deleted_at";
ALTER TABLE "warehouses" DROP COLUMN "deleted_at";
ALTER TABLE "users" DROP COLUMN "deleted_at";
ALTER TABLE "roles" DROP COLUMN "deleted_at";
ALTER TABLE "media_assets" DROP COLUMN "deleted_at";
ALTER TABLE "brands" DROP COLUMN "deleted_at";
ALTER TABLE "categories" DROP COLUMN "deleted_at";
ALTER TABLE "products" DROP COLUMN "deleted_at";
ALTER TABLE "product_variants" DROP COLUMN "deleted_at";
ALTER TABLE "product_media" DROP COLUMN "deleted_at";

COMMIT;
