-- Ba bảng cho việc gửi thông báo và đặt lại mật khẩu.
--
-- `notification_templates` trong model V1 CHƯA được tạo: nội dung email nằm trong mã nguồn vì V1
-- không có nhu cầu cho người ngoài team sửa nội dung. Thêm bảng đó khi có màn quản trị template.

-- Hàng đợi việc-cần-làm-sau, ghi cùng transaction với nghiệp vụ sinh ra nó.
CREATE TABLE "public"."outbox_events" (
  "id"             BIGSERIAL PRIMARY KEY,
  "aggregate_type" VARCHAR(100) NOT NULL,
  "aggregate_id"   BIGINT NOT NULL,
  "event_type"     VARCHAR(150) NOT NULL,
  "event_version"  INTEGER NOT NULL DEFAULT 1,
  "payload_json"   JSONB NOT NULL,
  "status"         VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  "attempts"       INTEGER NOT NULL DEFAULT 0,
  "available_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locked_at"      TIMESTAMPTZ(6),
  "locked_by"      VARCHAR(100),
  "processed_at"   TIMESTAMPTZ(6),
  "last_error"     TEXT,
  "created_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Worker lấy việc bằng (status, available_at, id); index này là đường đi của mọi vòng quét.
CREATE INDEX "outbox_events_status_available_at_id_idx"
  ON "public"."outbox_events"("status", "available_at", "id");
CREATE INDEX "outbox_events_aggregate_type_aggregate_id_idx"
  ON "public"."outbox_events"("aggregate_type", "aggregate_id");

-- Nhật ký gửi thông báo.
CREATE TABLE "public"."notifications" (
  "id"                  BIGSERIAL PRIMARY KEY,
  "user_id"             BIGINT,
  "customer_id"         BIGINT,
  "template_code"       VARCHAR(64) NOT NULL,
  "channel"             VARCHAR(24) NOT NULL,
  "dedup_key"           VARCHAR(150) NOT NULL,
  "recipient_masked"    VARCHAR(255) NOT NULL,
  "payload_json"        JSONB NOT NULL,
  "status"              VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  "attempt_count"       INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at"     TIMESTAMPTZ(6),
  "sent_at"             TIMESTAMPTZ(6),
  "provider_message_id" VARCHAR(255),
  "error_code"          VARCHAR(100),
  "created_at"          TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Chốt chặn gửi trùng: worker chạy lại hoặc hai replica cùng lấy một event thì lần thứ hai vi phạm
-- unique và dừng, thay vì gửi thêm một email nữa cho khách.
CREATE UNIQUE INDEX "notifications_channel_dedup_key_key"
  ON "public"."notifications"("channel", "dedup_key");
CREATE INDEX "notifications_status_next_attempt_at_idx"
  ON "public"."notifications"("status", "next_attempt_at");

ALTER TABLE "public"."notifications"
  ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id")
  REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."notifications"
  ADD CONSTRAINT "notifications_customer_id_fkey" FOREIGN KEY ("customer_id")
  REFERENCES "public"."customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Token đặt lại mật khẩu: chỉ lưu hash, dùng một lần, có hạn.
CREATE TABLE "public"."password_reset_tokens" (
  "id"              BIGSERIAL PRIMARY KEY,
  "user_id"         BIGINT NOT NULL,
  "token_hash"      VARCHAR(128) NOT NULL,
  "expires_at"      TIMESTAMPTZ(6) NOT NULL,
  "used_at"         TIMESTAMPTZ(6),
  "request_ip_hash" VARCHAR(128),
  "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key"
  ON "public"."password_reset_tokens"("token_hash");
CREATE INDEX "password_reset_tokens_user_id_created_at_idx"
  ON "public"."password_reset_tokens"("user_id", "created_at" DESC);
CREATE INDEX "password_reset_tokens_expires_at_idx"
  ON "public"."password_reset_tokens"("expires_at");

-- CASCADE: xoá tài khoản thì token đặt lại mật khẩu của tài khoản đó không còn nghĩa gì.
ALTER TABLE "public"."password_reset_tokens"
  ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id")
  REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
