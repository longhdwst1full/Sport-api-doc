-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
    "phone" VARCHAR(32),
    "email" VARCHAR(255),
    "address_json" JSONB NOT NULL,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    "version" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
    "is_primary" BOOLEAN NOT NULL DEFAULT true,
    "version" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "user_type" VARCHAR(24) NOT NULL,
    "email" VARCHAR(255),
    "normalized_email" VARCHAR(255),
    "phone" VARCHAR(32),
    "normalized_phone" VARCHAR(32),
    "password_hash" VARCHAR(255),
    "display_name" VARCHAR(255) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
    "email_verified_at" TIMESTAMPTZ(6),
    "phone_verified_at" TIMESTAMPTZ(6),
    "permission_version" BIGINT NOT NULL DEFAULT 0,
    "last_login_at" TIMESTAMPTZ(6),
    "version" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token_hash" VARCHAR(255) NOT NULL,
    "rotated_from_id" UUID,
    "device_id" VARCHAR(128),
    "device_info" JSONB,
    "ip_hash" VARCHAR(128),
    "user_agent_hash" VARCHAR(128),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "last_used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "revoke_reason" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "status" VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "version" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(150) NOT NULL,
    "module" VARCHAR(64) NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "description" TEXT,
    "is_sensitive" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "granted_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_role_assignments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL,
    "branch_id" UUID,
    "warehouse_id" UUID,
    "valid_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" TIMESTAMPTZ(6),
    "status" VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
    "assigned_by" UUID NOT NULL,
    "version" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "request_id" VARCHAR(100) NOT NULL,
    "sequence_no" INTEGER NOT NULL,
    "actor_type" VARCHAR(24) NOT NULL,
    "actor_user_id" UUID,
    "action" VARCHAR(150) NOT NULL,
    "entity_type" VARCHAR(100) NOT NULL,
    "entity_id" UUID,
    "before_json" JSONB,
    "after_json" JSONB,
    "reason" TEXT,
    "ip_hash" VARCHAR(128),
    "user_agent_hash" VARCHAR(128),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "branches_code_key" ON "branches"("code");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_branch_id_key" ON "warehouses"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_code_key" ON "warehouses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_refresh_token_hash_key" ON "auth_sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");

-- CreateIndex
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

-- CreateIndex
CREATE INDEX "role_permissions_granted_by_idx" ON "role_permissions"("granted_by");

-- CreateIndex
CREATE INDEX "user_role_assignments_user_id_idx" ON "user_role_assignments"("user_id");

-- CreateIndex
CREATE INDEX "user_role_assignments_role_id_idx" ON "user_role_assignments"("role_id");

-- CreateIndex
CREATE INDEX "user_role_assignments_branch_id_idx" ON "user_role_assignments"("branch_id");

-- CreateIndex
CREATE INDEX "user_role_assignments_warehouse_id_idx" ON "user_role_assignments"("warehouse_id");

-- CreateIndex
CREATE INDEX "user_role_assignments_assigned_by_idx" ON "user_role_assignments"("assigned_by");

-- CreateIndex
CREATE INDEX "user_role_assignments_status_valid_to_idx" ON "user_role_assignments"("status", "valid_to");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_created_at_idx" ON "audit_logs"("entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_request_id_sequence_no_key" ON "audit_logs"("request_id", "sequence_no");

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_rotated_from_id_fkey" FOREIGN KEY ("rotated_from_id") REFERENCES "auth_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- PostgreSQL constraints/indexes not fully expressible in Prisma 6 schema.
ALTER TABLE "branches"
  ADD CONSTRAINT "branches_status_check" CHECK ("status" IN ('ACTIVE', 'INACTIVE'));

ALTER TABLE "warehouses"
  ADD CONSTRAINT "warehouses_status_check" CHECK ("status" IN ('ACTIVE', 'INACTIVE')),
  ADD CONSTRAINT "warehouses_primary_check" CHECK ("is_primary" = true);

ALTER TABLE "users"
  ADD CONSTRAINT "users_type_check" CHECK ("user_type" IN ('CUSTOMER', 'STAFF', 'SYSTEM')),
  ADD CONSTRAINT "users_status_check" CHECK ("status" IN ('ACTIVE', 'INVITED', 'LOCKED', 'INACTIVE')),
  ADD CONSTRAINT "users_identity_check" CHECK (
    "normalized_email" IS NOT NULL OR "normalized_phone" IS NOT NULL OR "user_type" = 'SYSTEM'
  );

ALTER TABLE "roles"
  ADD CONSTRAINT "roles_status_check" CHECK ("status" IN ('ACTIVE', 'INACTIVE'));

ALTER TABLE "user_role_assignments"
  ADD CONSTRAINT "user_role_assignments_scope_check" CHECK (
    ("scope_type" IN ('GLOBAL', 'OWN') AND "branch_id" IS NULL AND "warehouse_id" IS NULL)
    OR ("scope_type" = 'BRANCH' AND "branch_id" IS NOT NULL AND "warehouse_id" IS NULL)
    OR ("scope_type" = 'WAREHOUSE' AND "branch_id" IS NULL AND "warehouse_id" IS NOT NULL)
  ),
  ADD CONSTRAINT "user_role_assignments_status_check" CHECK ("status" IN ('ACTIVE', 'EXPIRED', 'REVOKED')),
  ADD CONSTRAINT "user_role_assignments_validity_check" CHECK (
    "valid_to" IS NULL OR "valid_to" > "valid_from"
  );

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_actor_type_check" CHECK ("actor_type" IN ('USER', 'SYSTEM', 'GUEST')),
  ADD CONSTRAINT "audit_logs_sequence_check" CHECK ("sequence_no" > 0);

CREATE INDEX "auth_sessions_rotated_from_id_idx" ON "auth_sessions"("rotated_from_id");
CREATE INDEX "auth_sessions_active_user_idx" ON "auth_sessions"("user_id", "expires_at")
  WHERE "revoked_at" IS NULL;
CREATE UNIQUE INDEX "users_active_normalized_email_key" ON "users"("normalized_email")
  WHERE "normalized_email" IS NOT NULL AND "deleted_at" IS NULL;
CREATE UNIQUE INDEX "users_active_normalized_phone_key" ON "users"("normalized_phone")
  WHERE "normalized_phone" IS NOT NULL AND "deleted_at" IS NULL;
CREATE UNIQUE INDEX "user_role_assignments_global_own_key"
  ON "user_role_assignments"("user_id", "role_id", "scope_type")
  WHERE "scope_type" IN ('GLOBAL', 'OWN') AND "status" = 'ACTIVE';
CREATE UNIQUE INDEX "user_role_assignments_branch_key"
  ON "user_role_assignments"("user_id", "role_id", "branch_id")
  WHERE "scope_type" = 'BRANCH' AND "status" = 'ACTIVE';
CREATE UNIQUE INDEX "user_role_assignments_warehouse_key"
  ON "user_role_assignments"("user_id", "role_id", "warehouse_id")
  WHERE "scope_type" = 'WAREHOUSE' AND "status" = 'ACTIVE';

-- Supabase exposes public through the Data API. No policy is created in Wave 1,
-- so anon/authenticated access is deny-by-default while NestJS remains the owner.
ALTER TABLE "branches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "warehouses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "auth_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "role_permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_role_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;

-- Audit rows are append-only. This trigger protects history without mutating
-- any commerce business state.
CREATE FUNCTION "reject_audit_log_mutation"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs are append-only';
END;
$$;

CREATE TRIGGER "audit_logs_no_update_or_delete"
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW EXECUTE FUNCTION "reject_audit_log_mutation"();
