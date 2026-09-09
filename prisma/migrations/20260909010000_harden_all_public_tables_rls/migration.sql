-- Supabase exposes the public schema through its Data API by default. The
-- application deliberately uses NestJS/Prisma as its only data-access boundary,
-- so public Data API roles receive no direct table, sequence or function access.

-- Cover every current base table, including Prisma's internal migration history.
-- Do not FORCE RLS: the direct postgres owner connection used by Prisma must keep
-- running migrations and application transactions without browser-facing policies.
DO $$
DECLARE
  table_record record;
BEGIN
  FOR table_record IN
    SELECT format('%I.%I', namespace_row.nspname, table_row.relname) AS qualified_name
    FROM pg_class table_row
    JOIN pg_namespace namespace_row ON namespace_row.oid = table_row.relnamespace
    WHERE namespace_row.nspname = 'public'
      AND table_row.relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', table_record.qualified_name);
  END LOOP;
END;
$$;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- Prevent future Prisma/postgres-owned objects from silently becoming reachable
-- through PostgREST. Each intentional Data API surface must opt in explicitly.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- Existing application-owned trigger functions inherited Supabase's permissive
-- function defaults. Triggers still execute for postgres-owned application writes;
-- only direct calls from browser-facing roles are removed.
DO $$
DECLARE
  function_record record;
BEGIN
  FOR function_record IN
    SELECT format(
      '%I.%I(%s)',
      namespace_row.nspname,
      function_row.proname,
      pg_get_function_identity_arguments(function_row.oid)
    ) AS qualified_signature
    FROM pg_proc function_row
    JOIN pg_namespace namespace_row ON namespace_row.oid = function_row.pronamespace
    LEFT JOIN pg_depend dependency_row
      ON dependency_row.classid = 'pg_proc'::regclass
     AND dependency_row.objid = function_row.oid
     AND dependency_row.deptype = 'e'
    WHERE namespace_row.nspname = 'public'
      AND function_row.proowner = 'postgres'::regrole
      AND dependency_row.objid IS NULL
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      function_record.qualified_signature
    );
  END LOOP;
END;
$$;
