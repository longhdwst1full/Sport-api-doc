import { PrismaClient } from '@prisma/client';

describe('Sprint 3 checkout database foundation', () => {
  const prisma = new PrismaClient();

  afterAll(async () => prisma.$disconnect());

  it('keeps operational parameters out of the application schema', async () => {
    const result = await prisma.$queryRaw<Array<{ settings_table: string | null }>>`
      SELECT to_regclass('public.system_settings')::text AS settings_table
    `;

    expect(result[0].settings_table).toBeNull();
  });

  it('enables RLS on all ten Sprint 3 business tables', async () => {
    const tables = [
      'customers',
      'customer_addresses',
      'carts',
      'cart_items',
      'shipping_zones',
      'shipping_rates',
      'checkout_sessions',
      'checkout_session_items',
      'inventory_reservations',
      'inventory_reservation_items',
    ];
    const result = await prisma.$queryRaw<Array<{ protected_tables: bigint }>>`
      SELECT count(*) AS protected_tables
      FROM pg_class
      JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
      WHERE relname = ANY(${tables})
        AND pg_namespace.nspname = 'public'
        AND relrowsecurity
    `;

    expect(Number(result[0].protected_tables)).toBe(tables.length);
  });

  it('rejects an empty province list for a shipping zone', async () => {
    await expect(
      prisma.shippingZone.create({
        data: {
          code: `INVALID-${Date.now()}`,
          name: 'Invalid empty zone',
          provinceCodes: [],
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects a customer without email and phone identity', async () => {
    await expect(
      prisma.customer.create({
        data: {
          customerNo: `INVALID-${Date.now()}`,
          name: 'Invalid customer',
        },
      }),
    ).rejects.toThrow();
  });
});
