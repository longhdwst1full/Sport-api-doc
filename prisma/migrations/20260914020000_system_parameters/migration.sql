BEGIN;

SELECT pg_advisory_xact_lock(hashtext('dctd:system_parameters'));

-- Bảng tham số nghiệp vụ có thể sửa từ Admin mà không cần deploy.
--
-- Đảo quyết định D45 của Sprint 4 ("không thêm bảng system_settings, TTL/hold
-- dùng env"): env chỉ đổi được bằng redeploy nên các ngưỡng nghiệp vụ như biểu
-- phí giao hàng hay thời gian giữ đơn không cập nhật kịp theo vận hành.
--
-- RANH GIỚI: chỉ NGƯỠNG NGHIỆP VỤ vào bảng này. Bí mật và cấu hình hạ tầng
-- (chuỗi kết nối, JWT secret, khoá Cloudinary/GHN, cờ AUTH_BYPASS, bật/tắt job)
-- vẫn nằm ở env — đưa vào database là mở rộng bề mặt tấn công và cho phép sửa
-- cấu hình bảo mật qua giao diện.

CREATE TABLE "system_parameters" (
  "id"            BIGSERIAL PRIMARY KEY,
  "code"          VARCHAR(64)  NOT NULL,
  "group_code"    VARCHAR(32)  NOT NULL,
  "label"         VARCHAR(255) NOT NULL,
  "description"   TEXT,
  "value_type"    VARCHAR(16)  NOT NULL,
  "value"         TEXT         NOT NULL,
  "default_value" TEXT         NOT NULL,
  "min_value"     DECIMAL(19,2),
  "max_value"     DECIMAL(19,2),
  "unit"          VARCHAR(32),
  "sort_order"    INTEGER      NOT NULL DEFAULT 0,
  "status"        VARCHAR(24)  NOT NULL DEFAULT 'ACTIVE',
  "version"       BIGINT       NOT NULL DEFAULT 0,
  "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMPTZ(6) NOT NULL,
  "updated_by"    BIGINT
);

CREATE UNIQUE INDEX "system_parameters_code_key" ON "system_parameters"("code");
CREATE INDEX "system_parameters_group_code_sort_order_idx"
  ON "system_parameters"("group_code", "sort_order");
CREATE INDEX "system_parameters_status_idx" ON "system_parameters"("status");

-- Khoảng min/max phải hợp lệ ở tầng database, không chỉ ở service.
ALTER TABLE "system_parameters"
  ADD CONSTRAINT "system_parameters_value_type_check"
    CHECK ("value_type" IN ('INTEGER', 'DECIMAL', 'BOOLEAN', 'STRING')),
  ADD CONSTRAINT "system_parameters_range_check"
    CHECK ("min_value" IS NULL OR "max_value" IS NULL OR "max_value" >= "min_value");

ALTER TABLE "system_parameters"
  ADD CONSTRAINT "system_parameters_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "system_parameters" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "system_parameters" FROM anon, authenticated;

COMMIT;
