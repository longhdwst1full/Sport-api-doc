BEGIN;

SELECT pg_advisory_xact_lock(hashtext('dctd:system_parameters_is_system'));

-- Phân biệt hai loại tham số:
--
-- `is_system = true`  — có trong `SYSTEM_PARAMETER_CATALOG`, code đang đọc theo mã.
--   Chỉ được sửa giá trị. KHÔNG cho xoá hay đổi mã: xoá đi thì service rơi về
--   mặc định một cách âm thầm, đổi mã thì service không còn tìm thấy.
--
-- `is_system = false` — do Admin tự tạo, code không tham chiếu. Toàn quyền
--   thêm/sửa/xoá. Đây là chỗ cho các giá trị vận hành phát sinh sau này mà chưa
--   cần lập trình viên can thiệp.
ALTER TABLE "system_parameters"
  ADD COLUMN "is_system" BOOLEAN NOT NULL DEFAULT false;

-- Mọi bản ghi đang có đều sinh từ catalog nên là tham số hệ thống.
UPDATE "system_parameters" SET "is_system" = true;

CREATE INDEX "system_parameters_is_system_idx" ON "system_parameters"("is_system");

COMMIT;
