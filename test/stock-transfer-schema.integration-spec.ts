import { PrismaClient } from '@prisma/client';

describe('Stock transfer PostgreSQL schema', () => {
  const prisma = new PrismaClient();

  afterAll(async () => prisma.$disconnect());

  it('enables RLS and installs the transfer invariants', async () => {
    const tables = await prisma.$queryRaw<Array<{ table_name: string; rls_enabled: boolean }>>`
      SELECT relname AS table_name, relrowsecurity AS rls_enabled
      FROM pg_class
      WHERE oid IN ('public.stock_transfers'::regclass, 'public.stock_transfer_items'::regclass)
      ORDER BY relname
    `;
    const constraints = await prisma.$queryRaw<Array<{ constraint_name: string }>>`
      SELECT conname AS constraint_name
      FROM pg_constraint
      WHERE conrelid IN ('public.stock_transfers'::regclass, 'public.stock_transfer_items'::regclass)
        AND conname IN (
          'stock_transfers_warehouses_differ_check',
          'stock_transfers_status_check',
          'stock_transfers_state_timestamps_check',
          'stock_transfer_items_quantity_check',
          'stock_transfer_items_damage_reason_check',
          'stock_transfer_items_stock_transfer_id_product_variant_id_key'
        )
      ORDER BY conname
    `;

    expect(tables).toEqual([
      { table_name: 'stock_transfer_items', rls_enabled: true },
      { table_name: 'stock_transfers', rls_enabled: true },
    ]);
    expect(constraints).toHaveLength(6);
  });

  it('seeds transfer permissions only to owner and branch manager', async () => {
    const rows = await prisma.$queryRaw<Array<{ role_code: string; permission_count: number }>>`
      SELECT role.code AS role_code, COUNT(*)::integer AS permission_count
      FROM role_permissions mapping
      JOIN roles role ON role.id = mapping.role_id
      JOIN permissions permission ON permission.id = mapping.permission_id
      WHERE permission.code LIKE 'inventory.transfer.%'
      GROUP BY role.code
      ORDER BY role.code
    `;
    expect(rows).toEqual([
      { role_code: 'BRANCH_MANAGER', permission_count: 4 },
      { role_code: 'OWNER', permission_count: 4 },
    ]);
  });
});
