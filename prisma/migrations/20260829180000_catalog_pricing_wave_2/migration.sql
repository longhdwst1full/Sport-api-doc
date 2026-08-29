CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE "media_assets" (
  "id" UUID PRIMARY KEY, "provider" VARCHAR(32) NOT NULL,
  "provider_asset_id" VARCHAR(255) NOT NULL, "public_id" VARCHAR(500) NOT NULL,
  "resource_type" VARCHAR(24) NOT NULL DEFAULT 'IMAGE', "secure_url" TEXT NOT NULL,
  "thumbnail_url" TEXT, "format" VARCHAR(32), "mime_type" VARCHAR(100),
  "width" INTEGER, "height" INTEGER, "size_bytes" BIGINT, "checksum" VARCHAR(128),
  "folder" VARCHAR(255), "alt_text" VARCHAR(500), "metadata_json" JSONB,
  "status" VARCHAR(24) NOT NULL DEFAULT 'ACTIVE', "uploaded_by" UUID,
  "provider_created_at" TIMESTAMPTZ(6), "deleted_at" TIMESTAMPTZ(6),
  "version" BIGINT NOT NULL DEFAULT 0, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "media_assets_provider_provider_asset_id_key" UNIQUE ("provider", "provider_asset_id"),
  CONSTRAINT "media_assets_status_check" CHECK ("status" IN ('ACTIVE', 'INACTIVE')),
  CONSTRAINT "media_assets_dimensions_check" CHECK (
    ("width" IS NULL OR "width" > 0) AND ("height" IS NULL OR "height" > 0)
    AND ("size_bytes" IS NULL OR "size_bytes" >= 0)
  )
);

CREATE TABLE "brands" (
  "id" UUID PRIMARY KEY, "code" VARCHAR(32) NOT NULL UNIQUE, "name" VARCHAR(255) NOT NULL,
  "slug" VARCHAR(255) NOT NULL UNIQUE, "description" TEXT, "logo_asset_id" UUID,
  "status" VARCHAR(24) NOT NULL DEFAULT 'ACTIVE', "seo_json" JSONB,
  "version" BIGINT NOT NULL DEFAULT 0, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "brands_status_check" CHECK ("status" IN ('ACTIVE', 'INACTIVE'))
);

CREATE TABLE "categories" (
  "id" UUID PRIMARY KEY, "parent_id" UUID, "code" VARCHAR(32) NOT NULL UNIQUE,
  "name" VARCHAR(255) NOT NULL, "slug" VARCHAR(255) NOT NULL UNIQUE,
  "path" VARCHAR(1000) NOT NULL, "depth" INTEGER NOT NULL DEFAULT 0,
  "description" TEXT, "image_asset_id" UUID, "sort_order" INTEGER NOT NULL DEFAULT 0,
  "status" VARCHAR(24) NOT NULL DEFAULT 'ACTIVE', "seo_json" JSONB,
  "version" BIGINT NOT NULL DEFAULT 0, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "categories_status_check" CHECK ("status" IN ('ACTIVE', 'INACTIVE')),
  CONSTRAINT "categories_depth_check" CHECK ("depth" >= 0),
  CONSTRAINT "categories_not_self_parent_check" CHECK ("parent_id" IS NULL OR "parent_id" <> "id")
);

CREATE TABLE "products" (
  "id" UUID PRIMARY KEY, "brand_id" UUID, "product_no" VARCHAR(32) NOT NULL UNIQUE,
  "name" VARCHAR(255) NOT NULL, "slug" VARCHAR(255) NOT NULL UNIQUE,
  "short_description" TEXT, "description" TEXT,
  "status" VARCHAR(24) NOT NULL DEFAULT 'DRAFT', "published_at" TIMESTAMPTZ(6), "seo_json" JSONB,
  "version" BIGINT NOT NULL DEFAULT 0, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID, "updated_at" TIMESTAMPTZ(6) NOT NULL, "updated_by" UUID,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "products_status_check" CHECK ("status" IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  CONSTRAINT "products_publish_time_check" CHECK ("status" <> 'PUBLISHED' OR "published_at" IS NOT NULL)
);

CREATE TABLE "product_categories" (
  "product_id" UUID NOT NULL, "category_id" UUID NOT NULL,
  "is_primary" BOOLEAN NOT NULL DEFAULT false, "sort_order" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("product_id", "category_id")
);

CREATE TABLE "product_variants" (
  "id" UUID PRIMARY KEY, "product_id" UUID NOT NULL, "sku" VARCHAR(64) NOT NULL UNIQUE,
  "barcode" VARCHAR(64), "name" VARCHAR(255) NOT NULL, "weight_grams" INTEGER NOT NULL DEFAULT 0,
  "length_mm" INTEGER, "width_mm" INTEGER, "height_mm" INTEGER,
  "status" VARCHAR(24) NOT NULL DEFAULT 'ACTIVE', "version" BIGINT NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "product_variants_status_check" CHECK ("status" IN ('ACTIVE', 'INACTIVE')),
  CONSTRAINT "product_variants_dimensions_check" CHECK (
    "weight_grams" >= 0 AND ("length_mm" IS NULL OR "length_mm" > 0)
    AND ("width_mm" IS NULL OR "width_mm" > 0) AND ("height_mm" IS NULL OR "height_mm" > 0)
  )
);

CREATE TABLE "product_bundles" (
  "id" UUID PRIMARY KEY, "bundle_variant_id" UUID NOT NULL UNIQUE,
  "bundle_type" VARCHAR(24) NOT NULL DEFAULT 'FIXED_VIRTUAL',
  "status" VARCHAR(24) NOT NULL DEFAULT 'ACTIVE', "version" BIGINT NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "created_by" UUID NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, "updated_by" UUID NOT NULL,
  CONSTRAINT "product_bundles_type_check" CHECK ("bundle_type" = 'FIXED_VIRTUAL'),
  CONSTRAINT "product_bundles_status_check" CHECK ("status" IN ('ACTIVE', 'INACTIVE'))
);

CREATE TABLE "bundle_items" (
  "id" UUID PRIMARY KEY, "product_bundle_id" UUID NOT NULL,
  "component_variant_id" UUID NOT NULL, "quantity" INTEGER NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "bundle_items_product_bundle_id_component_variant_id_key" UNIQUE ("product_bundle_id", "component_variant_id"),
  CONSTRAINT "bundle_items_quantity_check" CHECK ("quantity" > 0)
);

CREATE TABLE "product_media" (
  "id" UUID PRIMARY KEY, "product_id" UUID NOT NULL, "variant_id" UUID,
  "media_asset_id" UUID NOT NULL, "media_type" VARCHAR(24) NOT NULL DEFAULT 'IMAGE',
  "alt_text" VARCHAR(500), "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_primary" BOOLEAN NOT NULL DEFAULT false, "status" VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "product_media_type_check" CHECK ("media_type" IN ('IMAGE', 'VIDEO')),
  CONSTRAINT "product_media_status_check" CHECK ("status" IN ('ACTIVE', 'INACTIVE'))
);

CREATE TABLE "product_prices" (
  "id" UUID PRIMARY KEY, "product_variant_id" UUID NOT NULL,
  "price_type" VARCHAR(24) NOT NULL DEFAULT 'REGULAR', "channel" VARCHAR(24) NOT NULL DEFAULT 'ONLINE',
  "currency_code" CHAR(3) NOT NULL DEFAULT 'VND', "amount" DECIMAL(19,2) NOT NULL,
  "starts_at" TIMESTAMPTZ(6) NOT NULL, "ends_at" TIMESTAMPTZ(6),
  "status" VARCHAR(24) NOT NULL DEFAULT 'SCHEDULED', "version" BIGINT NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "created_by" UUID NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, "updated_by" UUID NOT NULL,
  CONSTRAINT "product_prices_amount_check" CHECK ("amount" >= 0),
  CONSTRAINT "product_prices_window_check" CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at"),
  CONSTRAINT "product_prices_type_check" CHECK ("price_type" = 'REGULAR'),
  CONSTRAINT "product_prices_channel_check" CHECK ("channel" = 'ONLINE'),
  CONSTRAINT "product_prices_currency_check" CHECK ("currency_code" = 'VND'),
  CONSTRAINT "product_prices_status_check" CHECK ("status" IN ('SCHEDULED', 'ACTIVE', 'EXPIRED', 'CANCELLED'))
);

ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "brands" ADD CONSTRAINT "brands_logo_asset_id_fkey" FOREIGN KEY ("logo_asset_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "categories" ADD CONSTRAINT "categories_image_asset_id_fkey" FOREIGN KEY ("image_asset_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_bundles" ADD CONSTRAINT "product_bundles_bundle_variant_id_fkey" FOREIGN KEY ("bundle_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_bundles" ADD CONSTRAINT "product_bundles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_bundles" ADD CONSTRAINT "product_bundles_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bundle_items" ADD CONSTRAINT "bundle_items_product_bundle_id_fkey" FOREIGN KEY ("product_bundle_id") REFERENCES "product_bundles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bundle_items" ADD CONSTRAINT "bundle_items_component_variant_id_fkey" FOREIGN KEY ("component_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "media_assets_uploaded_by_idx" ON "media_assets"("uploaded_by");
CREATE INDEX "media_assets_status_created_at_idx" ON "media_assets"("status", "created_at");
CREATE INDEX "brands_logo_asset_id_idx" ON "brands"("logo_asset_id");
CREATE INDEX "brands_status_name_idx" ON "brands"("status", "name");
CREATE INDEX "categories_parent_id_sort_order_idx" ON "categories"("parent_id", "sort_order");
CREATE INDEX "categories_image_asset_id_idx" ON "categories"("image_asset_id");
CREATE INDEX "categories_status_name_idx" ON "categories"("status", "name");
CREATE INDEX "products_brand_id_idx" ON "products"("brand_id");
CREATE INDEX "products_status_published_at_idx" ON "products"("status", "published_at");
CREATE INDEX "products_name_idx" ON "products"("name");
CREATE INDEX "product_categories_category_id_idx" ON "product_categories"("category_id");
CREATE UNIQUE INDEX "product_categories_primary_key" ON "product_categories"("product_id") WHERE "is_primary";
CREATE INDEX "product_variants_product_id_status_idx" ON "product_variants"("product_id", "status");
CREATE UNIQUE INDEX "product_variants_active_barcode_key" ON "product_variants"("barcode") WHERE "barcode" IS NOT NULL AND "deleted_at" IS NULL;
CREATE INDEX "bundle_items_component_variant_id_idx" ON "bundle_items"("component_variant_id");
CREATE INDEX "product_media_product_id_sort_order_idx" ON "product_media"("product_id", "sort_order");
CREATE INDEX "product_media_variant_id_sort_order_idx" ON "product_media"("variant_id", "sort_order");
CREATE INDEX "product_media_media_asset_id_idx" ON "product_media"("media_asset_id");
CREATE UNIQUE INDEX "product_media_product_primary_key" ON "product_media"("product_id") WHERE "variant_id" IS NULL AND "is_primary" AND "status" = 'ACTIVE' AND "deleted_at" IS NULL;
CREATE UNIQUE INDEX "product_media_variant_primary_key" ON "product_media"("variant_id") WHERE "variant_id" IS NOT NULL AND "is_primary" AND "status" = 'ACTIVE' AND "deleted_at" IS NULL;
CREATE INDEX "product_prices_product_variant_id_status_starts_at_idx" ON "product_prices"("product_variant_id", "status", "starts_at");

ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_no_overlap"
EXCLUDE USING gist (
  "product_variant_id" WITH =, "price_type" WITH =, "channel" WITH =,
  tstzrange("starts_at", COALESCE("ends_at", 'infinity'::timestamptz), '[)') WITH &&
) WHERE ("status" IN ('SCHEDULED', 'ACTIVE'));

CREATE FUNCTION "validate_bundle_not_nested"() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_TABLE_NAME = 'bundle_items' AND EXISTS (
    SELECT 1 FROM public.product_bundles pb WHERE pb.bundle_variant_id = NEW.component_variant_id
  ) THEN RAISE EXCEPTION 'nested bundles are not allowed'; END IF;
  IF TG_TABLE_NAME = 'product_bundles' AND EXISTS (
    SELECT 1 FROM public.bundle_items bi WHERE bi.component_variant_id = NEW.bundle_variant_id
  ) THEN RAISE EXCEPTION 'nested bundles are not allowed'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER "bundle_items_not_nested" BEFORE INSERT OR UPDATE ON "bundle_items" FOR EACH ROW EXECUTE FUNCTION "validate_bundle_not_nested"();
CREATE TRIGGER "product_bundles_not_nested" BEFORE INSERT OR UPDATE ON "product_bundles" FOR EACH ROW EXECUTE FUNCTION "validate_bundle_not_nested"();

CREATE FUNCTION "validate_product_media_variant"() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.variant_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.product_variants pv WHERE pv.id = NEW.variant_id AND pv.product_id = NEW.product_id
  ) THEN RAISE EXCEPTION 'media variant must belong to product'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER "product_media_variant_owner" BEFORE INSERT OR UPDATE ON "product_media" FOR EACH ROW EXECUTE FUNCTION "validate_product_media_variant"();

ALTER TABLE "media_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "brands" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_variants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_bundles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bundle_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_media" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_prices" ENABLE ROW LEVEL SECURITY;
