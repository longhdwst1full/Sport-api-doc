BEGIN;

SELECT pg_advisory_xact_lock(hashtext('dctd:flash_sale_actor_nullable'));

-- Mọi bảng khác trong V1 đều để `created_by`/`updated_by` nullable và dùng
-- `toOptionalDatabaseId`: actor có thể là system principal hoặc phiên chưa gắn
-- user trong database. Flash sale phải theo cùng quy ước, nếu không thao tác
-- hợp lệ sẽ bị chặn bởi ràng buộc NOT NULL thay vì bởi phân quyền.
ALTER TABLE "flash_sale_campaigns"
  ALTER COLUMN "created_by" DROP NOT NULL,
  ALTER COLUMN "updated_by" DROP NOT NULL;

COMMIT;
