-- D43 forward-fix: actor columns without an FK were not discovered by the
-- generic UUID -> BIGINT migration. Resolve every historical UUID through
-- users.legacy_id before replacing the columns. Abort on any orphan.
BEGIN;

SELECT pg_advisory_xact_lock(hashtext('dctd:fix_unconstrained_actor_bigint_columns'));

LOCK TABLE public.users IN SHARE MODE;
LOCK TABLE public.branches, public.warehouses, public.roles IN ACCESS EXCLUSIVE MODE;

ALTER TABLE public.branches
  ADD COLUMN created_by__bigint BIGINT,
  ADD COLUMN updated_by__bigint BIGINT;
ALTER TABLE public.warehouses
  ADD COLUMN created_by__bigint BIGINT,
  ADD COLUMN updated_by__bigint BIGINT;
ALTER TABLE public.roles
  ADD COLUMN created_by__bigint BIGINT,
  ADD COLUMN updated_by__bigint BIGINT;

UPDATE public.branches target
SET created_by__bigint = actor.id
FROM public.users actor
WHERE target.created_by = actor.legacy_id;
UPDATE public.branches target
SET updated_by__bigint = actor.id
FROM public.users actor
WHERE target.updated_by = actor.legacy_id;

UPDATE public.warehouses target
SET created_by__bigint = actor.id
FROM public.users actor
WHERE target.created_by = actor.legacy_id;
UPDATE public.warehouses target
SET updated_by__bigint = actor.id
FROM public.users actor
WHERE target.updated_by = actor.legacy_id;

UPDATE public.roles target
SET created_by__bigint = actor.id
FROM public.users actor
WHERE target.created_by = actor.legacy_id;
UPDATE public.roles target
SET updated_by__bigint = actor.id
FROM public.users actor
WHERE target.updated_by = actor.legacy_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.branches
    WHERE (created_by IS NOT NULL AND created_by__bigint IS NULL)
       OR (updated_by IS NOT NULL AND updated_by__bigint IS NULL)
  ) OR EXISTS (
    SELECT 1 FROM public.warehouses
    WHERE (created_by IS NOT NULL AND created_by__bigint IS NULL)
       OR (updated_by IS NOT NULL AND updated_by__bigint IS NULL)
  ) OR EXISTS (
    SELECT 1 FROM public.roles
    WHERE (created_by IS NOT NULL AND created_by__bigint IS NULL)
       OR (updated_by IS NOT NULL AND updated_by__bigint IS NULL)
  ) THEN
    RAISE EXCEPTION 'Unmapped historical actor UUID; refusing lossy actor column migration';
  END IF;
END $$;

ALTER TABLE public.branches
  DROP COLUMN created_by,
  DROP COLUMN updated_by;
ALTER TABLE public.branches
  RENAME COLUMN created_by__bigint TO created_by;
ALTER TABLE public.branches
  RENAME COLUMN updated_by__bigint TO updated_by;

ALTER TABLE public.warehouses
  DROP COLUMN created_by,
  DROP COLUMN updated_by;
ALTER TABLE public.warehouses
  RENAME COLUMN created_by__bigint TO created_by;
ALTER TABLE public.warehouses
  RENAME COLUMN updated_by__bigint TO updated_by;

ALTER TABLE public.roles
  DROP COLUMN created_by,
  DROP COLUMN updated_by;
ALTER TABLE public.roles
  RENAME COLUMN created_by__bigint TO created_by;
ALTER TABLE public.roles
  RENAME COLUMN updated_by__bigint TO updated_by;

COMMIT;
