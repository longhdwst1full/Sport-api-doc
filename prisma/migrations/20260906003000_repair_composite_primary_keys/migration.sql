-- D43 replaced UUID foreign-key columns with BIGINT columns. PostgreSQL dropped
-- the local composite primary keys that depended on those columns. Restore the
-- two junction-table invariants after removing only semantically identical
-- role-permission rows created by repeated seed runs.
BEGIN;

SELECT pg_advisory_xact_lock(hashtext('dctd:repair_composite_primary_keys'));

LOCK TABLE public.product_categories IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.role_permissions IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.product_categories
    GROUP BY product_id, category_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot restore product_categories primary key: duplicate product/category pairs require manual review';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.role_permissions
    GROUP BY role_id, permission_id
    HAVING COUNT(DISTINCT COALESCE(granted_by, -1::bigint)) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot restore role_permissions primary key: duplicate grants have different actors';
  END IF;
END $$;

WITH ranked_duplicates AS (
  SELECT
    ctid,
    ROW_NUMBER() OVER (
      PARTITION BY role_id, permission_id
      ORDER BY created_at ASC, ctid ASC
    ) AS duplicate_rank
  FROM public.role_permissions
)
DELETE FROM public.role_permissions role_permission
USING ranked_duplicates duplicate
WHERE role_permission.ctid = duplicate.ctid
  AND duplicate.duplicate_rank > 1;

ALTER TABLE public.product_categories
  ADD CONSTRAINT product_categories_pkey PRIMARY KEY (product_id, category_id);

ALTER TABLE public.role_permissions
  ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission_id);

COMMIT;
