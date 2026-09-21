-- Ảnh đại diện khách hàng trỏ vào media_assets thay vì lưu URL rời, để xoá ảnh vẫn tra được
-- provider key trên Cloudinary và không sinh ảnh mồ côi.
ALTER TABLE "public"."customers" ADD COLUMN "avatar_asset_id" BIGINT;

-- SET NULL: xoá media asset không được phép chặn hồ sơ khách; khách chỉ mất ảnh đại diện.
ALTER TABLE "public"."customers"
  ADD CONSTRAINT "customers_avatar_asset_id_fkey"
  FOREIGN KEY ("avatar_asset_id") REFERENCES "public"."media_assets"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "customers_avatar_asset_id_idx" ON "public"."customers"("avatar_asset_id");
