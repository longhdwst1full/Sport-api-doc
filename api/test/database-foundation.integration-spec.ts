import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';

describe('Wave 1 PostgreSQL foundation', () => {
  const prisma = new PrismaClient();

  afterAll(async () => prisma.$disconnect());

  it('keeps the repeatable baseline seed stable', async () => {
    const [branches, warehouses, users, roles, assignments] = await Promise.all([
      prisma.branch.count(),
      prisma.warehouse.count(),
      prisma.user.count(),
      prisma.role.count(),
      prisma.userRoleAssignment.count(),
    ]);

    expect({ branches, warehouses, users, roles, assignments }).toEqual({
      branches: 1,
      warehouses: 1,
      users: 1,
      roles: 3,
      assignments: 1,
    });
  });

  it('enables RLS deny-by-default protection on every Wave 1 table', async () => {
    const result = await prisma.$queryRaw<Array<{ protected_tables: bigint }>>`
      SELECT count(*) AS protected_tables
      FROM pg_class
      WHERE relname IN (
        'branches', 'warehouses', 'users', 'auth_sessions', 'roles',
        'permissions', 'role_permissions', 'user_role_assignments', 'audit_logs'
      ) AND relrowsecurity
    `;

    expect(Number(result[0].protected_tables)).toBe(9);
  });

  it('rejects a GLOBAL assignment carrying a branch identifier', async () => {
    const [user, role, branch] = await Promise.all([
      prisma.user.findFirstOrThrow(),
      prisma.role.findUniqueOrThrow({ where: { code: 'SUPER_ADMIN' } }),
      prisma.branch.findFirstOrThrow(),
    ]);

    await expect(
      prisma.userRoleAssignment.create({
        data: {
          id: uuidv7(),
          userId: user.id,
          roleId: role.id,
          scopeType: 'GLOBAL',
          branchId: branch.id,
          assignedBy: user.id,
        },
      }),
    ).rejects.toThrow();
  });

  it('enforces active normalized email uniqueness', async () => {
    const normalizedEmail = `integration-${uuidv7()}@example.invalid`;
    await expect(
      prisma.$transaction(async (transaction) => {
        await transaction.user.create({
          data: {
            id: uuidv7(),
            userType: 'STAFF',
            email: normalizedEmail,
            normalizedEmail,
            displayName: 'Integration User 1',
            status: 'INVITED',
          },
        });
        await transaction.user.create({
          data: {
            id: uuidv7(),
            userType: 'STAFF',
            email: normalizedEmail,
            normalizedEmail,
            displayName: 'Integration User 2',
            status: 'INVITED',
          },
        });
      }),
    ).rejects.toThrow();
  });

  it('rolls back and rejects audit mutation', async () => {
    const requestId = `integration-${uuidv7()}`;
    await expect(
      prisma.$transaction(async (transaction) => {
        await transaction.auditLog.create({
          data: {
            id: uuidv7(),
            requestId,
            sequenceNo: 1,
            actorType: 'SYSTEM',
            action: 'foundation.integration-test',
            entityType: 'SYSTEM',
          },
        });
        await transaction.auditLog.update({
          where: { requestId_sequenceNo: { requestId, sequenceNo: 1 } },
          data: { reason: 'must be rejected' },
        });
      }),
    ).rejects.toThrow('audit_logs are append-only');

    await expect(prisma.auditLog.count({ where: { requestId } })).resolves.toBe(0);
  });
});
