ALTER TABLE "users"
  ADD COLUMN "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "locked_at" TIMESTAMPTZ(6),
  ADD COLUMN "lock_reason" VARCHAR(255);

ALTER TABLE "users"
  ADD CONSTRAINT "users_failed_login_attempts_non_negative"
  CHECK ("failed_login_attempts" >= 0);

CREATE INDEX "audit_logs_created_at_id_idx"
  ON "audit_logs"("created_at" DESC, "id" DESC);
