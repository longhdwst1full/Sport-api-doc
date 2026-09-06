import { PrismaClient } from '@prisma/client';

describe('Junction-table PostgreSQL constraints', () => {
  const prisma = new PrismaClient();

  afterAll(async () => prisma.$disconnect());

  it('keeps the IAM and catalog composite primary keys installed', async () => {
    const primaryKeys = await prisma.$queryRaw<Array<{
      table_name: string;
      definition: string;
    }>>`
      SELECT
        relation.relname AS table_name,
        pg_get_constraintdef(constraint_row.oid) AS definition
      FROM pg_constraint constraint_row
      JOIN pg_class relation ON relation.oid = constraint_row.conrelid
      JOIN pg_namespace namespace_row ON namespace_row.oid = relation.relnamespace
      WHERE namespace_row.nspname = 'public'
        AND constraint_row.contype = 'p'
        AND relation.relname IN ('product_categories', 'role_permissions')
      ORDER BY relation.relname
    `;

    expect(primaryKeys).toEqual([
      {
        table_name: 'product_categories',
        definition: 'PRIMARY KEY (product_id, category_id)',
      },
      {
        table_name: 'role_permissions',
        definition: 'PRIMARY KEY (role_id, permission_id)',
      },
    ]);
  });

  it('contains no duplicate junction pairs', async () => {
    const duplicates = await prisma.$queryRaw<Array<{
      product_category_duplicates: number;
      role_permission_duplicates: number;
    }>>`
      SELECT
        (
          SELECT COUNT(*)::integer
          FROM (
            SELECT 1
            FROM product_categories
            GROUP BY product_id, category_id
            HAVING COUNT(*) > 1
          ) duplicate_product_categories
        ) AS product_category_duplicates,
        (
          SELECT COUNT(*)::integer
          FROM (
            SELECT 1
            FROM role_permissions
            GROUP BY role_id, permission_id
            HAVING COUNT(*) > 1
          ) duplicate_role_permissions
        ) AS role_permission_duplicates
    `;

    expect(duplicates).toEqual([
      {
        product_category_duplicates: 0,
        role_permission_duplicates: 0,
      },
    ]);
  });
});
