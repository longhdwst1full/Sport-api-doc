-- Audit actors must remain attributable. User deletion is soft-delete in V1,
-- therefore an audit FK must never null the historical actor.
ALTER TABLE "audit_logs"
  DROP CONSTRAINT "audit_logs_actor_user_id_fkey";

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve malformed pre-hardening rows without falsely attributing them to a
-- user. This migration is the only controlled exception to append-only writes.
ALTER TABLE "audit_logs" DISABLE TRIGGER "audit_logs_no_update_or_delete";
UPDATE "audit_logs"
SET "actor_type" = 'SYSTEM'
WHERE "actor_type" = 'USER' AND "actor_user_id" IS NULL;
ALTER TABLE "audit_logs" ENABLE TRIGGER "audit_logs_no_update_or_delete";

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_actor_consistency_check" CHECK (
    ("actor_type" = 'USER' AND "actor_user_id" IS NOT NULL)
    OR ("actor_type" IN ('SYSTEM', 'GUEST') AND "actor_user_id" IS NULL)
  );

-- Row triggers do not fire for TRUNCATE; protect it explicitly at statement level.
CREATE TRIGGER "audit_logs_no_truncate"
BEFORE TRUNCATE ON "audit_logs"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_audit_log_mutation"();
