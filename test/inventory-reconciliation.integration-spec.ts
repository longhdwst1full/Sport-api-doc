import { PrismaClient } from '@prisma/client';

describe('Inventory PostgreSQL reconciliation', () => {
  const prisma = new PrismaClient();

  afterAll(async () => prisma.$disconnect());

  it('keeps every materialized balance equal to the immutable movement sum', async () => {
    const mismatches = await prisma.$queryRaw<Array<{
      warehouse_id: bigint;
      product_variant_id: bigint;
      on_hand: number;
      movement_total: bigint;
    }>>`
      SELECT
        balance.warehouse_id,
        balance.product_variant_id,
        balance.on_hand,
        COALESCE(SUM(movement.quantity_delta), 0)::bigint AS movement_total
      FROM inventory_balances balance
      LEFT JOIN inventory_movements movement
        ON movement.warehouse_id = balance.warehouse_id
       AND movement.product_variant_id = balance.product_variant_id
      GROUP BY balance.id, balance.warehouse_id, balance.product_variant_id, balance.on_hand
      HAVING balance.on_hand <> COALESCE(SUM(movement.quantity_delta), 0)
    `;

    expect(mismatches).toEqual([]);
  });
});
