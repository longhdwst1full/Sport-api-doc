-- Product Media provider deletion needs a durable claim between the DB commit and Cloudinary call.
-- NOT VALID keeps the ACCESS EXCLUSIVE phase short; validation scans existing rows afterwards.
SET lock_timeout = '5s';

ALTER TABLE "media_assets"
  DROP CONSTRAINT "media_assets_status_check";

ALTER TABLE "media_assets"
  ADD CONSTRAINT "media_assets_status_check"
  CHECK ("status" IN ('ACTIVE', 'DELETE_PENDING', 'INACTIVE')) NOT VALID;

ALTER TABLE "media_assets"
  VALIDATE CONSTRAINT "media_assets_status_check";

RESET lock_timeout;
