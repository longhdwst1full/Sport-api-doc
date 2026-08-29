-- A refresh session may be rotated exactly once. This database constraint closes
-- the race where concurrent refresh requests both try to create a successor.
DROP INDEX IF EXISTS "auth_sessions_rotated_from_id_idx";

CREATE UNIQUE INDEX "auth_sessions_rotated_from_id_key"
ON "auth_sessions"("rotated_from_id");
