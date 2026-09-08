BEGIN;

SELECT pg_advisory_xact_lock(hashtext('dctd:remove_system_settings_use_env'));

-- Operational parameters are deployment configuration in V1.
-- Keep secrets and environment-specific values outside the shared application database.
DROP TABLE IF EXISTS public.system_settings;

COMMIT;
