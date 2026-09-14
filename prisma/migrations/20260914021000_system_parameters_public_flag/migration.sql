BEGIN;

SELECT pg_advisory_xact_lock(hashtext('dctd:system_parameters_public_flag'));

-- Kế thừa từ `msttparameter` của fund-ops-service:
--
-- 1. `is_public` — bên đó có whitelist `app.parameter.public-param-names` để lọc
--    tham số được phép lộ ra API công khai. Ở đây đặt cờ ngay trên bản ghi thay
--    vì file cấu hình: whitelist trong config bị lệch khi rolling update, còn cờ
--    trên bản ghi thì luôn đi cùng dữ liệu.
-- 2. `created_by` — bên đó có đủ cặp reg_user_id/upd_user_id; ta mới có updated_by.
-- 3. `remarks` — ghi chú vận hành do người sửa nhập, tách khỏi `description` là
--    mô tả cố định của catalog.
ALTER TABLE "system_parameters"
  ADD COLUMN "is_public" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "created_by" BIGINT,
  ADD COLUMN "remarks" VARCHAR(500);

CREATE INDEX "system_parameters_is_public_idx" ON "system_parameters"("is_public");

ALTER TABLE "system_parameters"
  ADD CONSTRAINT "system_parameters_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
