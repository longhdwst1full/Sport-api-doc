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

  it('enables RLS on all persisted inventory tables', async () => {
    const tables = await prisma.$queryRaw<Array<{ table_name: string; rls_enabled: boolean }>>`
      SELECT relname AS table_name, relrowsecurity AS rls_enabled
      FROM pg_class
      WHERE oid IN (
        'public.inventory_balances'::regclass,
        'public.inventory_movements'::regclass,
        'public.stock_adjustments'::regclass,
        'public.stock_adjustment_items'::regclass,
        'public.stock_transfers'::regclass,
        'public.stock_transfer_items'::regclass
      )
      ORDER BY relname
    `;

    expect(tables).toHaveLength(6);
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
