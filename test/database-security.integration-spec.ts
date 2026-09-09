import { PrismaClient } from '@prisma/client';

describe('Public schema security and warehouse cardinality', () => {
  const prisma = new PrismaClient();

  afterAll(async () => prisma.$disconnect());

  it('keeps exactly one warehouse per branch without a redundant primary flag', async () => {
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'warehouses'
        AND column_name = 'is_primary'
    `;
    const uniqueIndex = await prisma.$queryRaw<Array<{ index_name: string }>>`
      SELECT index_row.relname AS index_name
      FROM pg_index index_meta
      JOIN pg_class index_row ON index_row.oid = index_meta.indexrelid
      JOIN pg_attribute column_row
        ON column_row.attrelid = index_meta.indrelid
       AND column_row.attnum = ANY(index_meta.indkey)
      WHERE index_meta.indrelid = 'public.warehouses'::regclass
        AND index_meta.indisunique
        AND index_meta.indnatts = 1
        AND column_row.attname = 'branch_id'
    `;

    expect(columns).toHaveLength(0);
    expect(uniqueIndex).toHaveLength(1);
  });

  it('enables RLS on every public base table, including Prisma migration history', async () => {
    const tables = await prisma.$queryRaw<Array<{ table_name: string; rls_enabled: boolean }>>`
      SELECT relname AS table_name, relrowsecurity AS rls_enabled
      FROM pg_class table_row
      JOIN pg_namespace namespace_row ON namespace_row.oid = table_row.relnamespace
      WHERE namespace_row.nspname = 'public'
        AND table_row.relkind = 'r'
      ORDER BY relname
    `;

    expect(tables.length).toBeGreaterThan(0);
    expect(tables).toContainEqual({ table_name: '_prisma_migrations', rls_enabled: true });
    expect(tables.every(({ rls_enabled: enabled }) => enabled)).toBe(true);
  });

  it.each(['anon', 'authenticated'])('revokes direct public-table access from %s', async (role) => {
    const result = await prisma.$queryRawUnsafe<Array<{ accessible_tables: number }>>(
      `SELECT COUNT(*)::integer AS accessible_tables
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_type = 'BASE TABLE'
         AND has_table_privilege(
           $1,
           format('%I.%I', table_schema, table_name),
           'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
         )`,
      role,
    );

    expect(result[0]?.accessible_tables).toBe(0);
  });

  it('keeps future postgres-owned tables, sequences and functions private by default', async () => {
    const rows = await prisma.$queryRaw<Array<{ object_type: string; access_control: string }>>`
      SELECT
        default_acl.defaclobjtype AS object_type,
        COALESCE(array_to_string(default_acl.defaclacl, ','), '') AS access_control
      FROM pg_default_acl default_acl
      WHERE default_acl.defaclnamespace = 'public'::regnamespace
        AND default_acl.defaclrole = 'postgres'::regrole
        AND default_acl.defaclobjtype IN ('r', 'S', 'f')
      ORDER BY default_acl.defaclobjtype
    `;

    expect(rows).toHaveLength(3);
    expect(rows.every(({ access_control: acl }) => !/(anon|authenticated)=/.test(acl))).toBe(true);
  });

  it('denies browser-facing roles direct execution of application-owned functions', async () => {
    const rows = await prisma.$queryRaw<Array<{ function_name: string }>>`
      SELECT function_row.oid::regprocedure::text AS function_name
      FROM pg_proc function_row
      JOIN pg_namespace namespace_row ON namespace_row.oid = function_row.pronamespace
      LEFT JOIN pg_depend dependency_row
        ON dependency_row.classid = 'pg_proc'::regclass
       AND dependency_row.objid = function_row.oid
       AND dependency_row.deptype = 'e'
      WHERE namespace_row.nspname = 'public'
        AND function_row.proowner = 'postgres'::regrole
        AND dependency_row.objid IS NULL
        AND (
          has_function_privilege('anon', function_row.oid, 'EXECUTE')
          OR has_function_privilege('authenticated', function_row.oid, 'EXECUTE')
        )
    `;

    expect(rows).toHaveLength(0);
  });

  it('installs indexes that match inventory keyset pagination', async () => {
    const indexes = await prisma.$queryRaw<Array<{ index_name: string }>>`
      SELECT indexname AS index_name
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'inventory_movements_occurred_at_id_idx',
          'inventory_movements_warehouse_id_occurred_at_id_idx',
          'stock_adjustments_warehouse_id_posted_at_id_idx'
        )
      ORDER BY indexname
    `;

    expect(indexes).toHaveLength(3);
  });
});
