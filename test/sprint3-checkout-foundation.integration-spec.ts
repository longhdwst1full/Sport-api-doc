import { PrismaClient } from '@prisma/client';

describe('Sprint 3 checkout database foundation', () => {
  const prisma = new PrismaClient();

  afterAll(async () => prisma.$disconnect());

  it('installs the private 30-minute reservation TTL exactly once', async () => {
    const settings = await prisma.systemSetting.findMany({
      where: { key: 'checkout.reservation_ttl_minutes' },
    });

    expect(settings).toHaveLength(1);
    expect(settings[0]).toMatchObject({
      valueJson: 30,
      valueType: 'INTEGER',
      isPublic: false,
      status: 'ACTIVE',
    });
  });

  it('enables RLS on all eleven Sprint 3 tables', async () => {
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
      'system_settings',
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
