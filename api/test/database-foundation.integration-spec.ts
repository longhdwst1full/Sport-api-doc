import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { PrismaService } from '../src/database/prisma.service';
import { PrismaAuditWriter } from '../src/modules/audit/audit.writer';

describe('Wave 1 PostgreSQL foundation', () => {
  const prisma = new PrismaClient();
  const auditWriter = new PrismaAuditWriter({ isEnabled: () => true } as PrismaService);

  afterAll(async () => prisma.$disconnect());

  it('keeps the repeatable baseline seed stable', async () => {
    const [branches, warehouses, users, roles, assignments, retiredActiveRoles, retiredActiveAssignments] = await Promise.all([
      prisma.branch.count({ where: { code: 'CN-HCM-01' } }),
      prisma.warehouse.count({ where: { code: 'KHO-HCM-01' } }),
      prisma.user.count({ where: { id: '00000000-0000-7000-8000-000000000010' } }),
      prisma.role.count({ where: { status: 'ACTIVE' } }),
      prisma.userRoleAssignment.count({
        where: {
          userId: '00000000-0000-7000-8000-000000000010',
          role: { code: 'OWNER' },
          status: 'ACTIVE',
        },
      }),
      prisma.role.count({
        where: {
          code: { in: ['SUPER_ADMIN', 'CATALOG_MANAGER', 'PRICING_MANAGER'] },
          status: 'ACTIVE',
        },
      }),
      prisma.userRoleAssignment.count({
        where: {
          status: 'ACTIVE',
          role: { code: { in: ['SUPER_ADMIN', 'CATALOG_MANAGER', 'PRICING_MANAGER'] } },
        },
      }),
    ]);

    expect({ branches, warehouses, users, roles, assignments }).toEqual({
      branches: 1,
      warehouses: 1,
      users: 1,
      roles: 3,
      assignments: 1,
    });
    expect(retiredActiveRoles).toBe(0);
    expect(retiredActiveAssignments).toBe(0);
  });

  it('enables RLS deny-by-default protection on every Wave 1 table', async () => {
    const result = await prisma.$queryRaw<Array<{ protected_tables: bigint }>>`
      SELECT count(*) AS protected_tables
      FROM pg_class
      JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
      WHERE relname IN (
        'branches', 'warehouses', 'users', 'auth_sessions', 'roles',
        'permissions', 'role_permissions', 'user_role_assignments', 'audit_logs'
      ) AND pg_namespace.nspname = 'public' AND relrowsecurity
    `;

    expect(Number(result[0].protected_tables)).toBe(9);
  });

  it('rejects a GLOBAL assignment carrying a branch identifier', async () => {
    const [user, role, branch] = await Promise.all([
      prisma.user.findFirstOrThrow(),
      prisma.role.findUniqueOrThrow({ where: { code: 'OWNER' } }),
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

  it.each(['DELETE', 'TRUNCATE'] as const)('rejects audit %s operations', async (operation) => {
    const requestId = `immutable-${operation.toLowerCase()}-${uuidv7()}`;
    await prisma.auditLog.create({
      data: {
        id: uuidv7(),
        requestId,
        sequenceNo: 1,
        actorType: 'SYSTEM',
        action: 'foundation.immutability-test',
        entityType: 'SYSTEM',
      },
    });

    const statement =
      operation === 'DELETE'
        ? `DELETE FROM "audit_logs" WHERE "request_id" = '${requestId}'`
        : 'TRUNCATE TABLE "audit_logs"';
    await expect(prisma.$executeRawUnsafe(statement)).rejects.toThrow('audit_logs are append-only');
  });

  it('enforces audit actor consistency', async () => {
    await expect(
      prisma.auditLog.create({
        data: {
          id: uuidv7(),
          requestId: `actor-${uuidv7()}`,
          sequenceNo: 1,
          actorType: 'USER',
          action: 'foundation.actor-test',
          entityType: 'SYSTEM',
        },
      }),
    ).rejects.toThrow();
  });

  it('rolls back audit with its business mutation', async () => {
    const requestId = `atomic-business-fail-${uuidv7()}`;
    await expect(
      prisma.$transaction(async (transaction) => {
        await auditWriter.write(
          {
            requestId,
            sequenceNo: 1,
            actorType: 'SYSTEM',
            action: 'branch.update',
            entityType: 'BRANCH',
          },
          transaction,
        );
        throw new Error('simulated business failure');
      }),
    ).rejects.toThrow('simulated business failure');
    await expect(prisma.auditLog.count({ where: { requestId } })).resolves.toBe(0);
  });

  it('rolls back a business mutation when audit validation fails', async () => {
    const branch = await prisma.branch.findFirstOrThrow();
    await expect(
      prisma.$transaction(async (transaction) => {
        await transaction.branch.update({
          where: { id: branch.id },
          data: { name: 'Must roll back' },
        });
        await auditWriter.write(
          {
            requestId: `atomic-audit-fail-${uuidv7()}`,
            sequenceNo: 1,
            actorType: 'USER',
            action: 'branch.update',
            entityType: 'BRANCH',
            entityId: branch.id,
          },
          transaction,
        );
      }),
    ).rejects.toThrow();
    await expect(prisma.branch.findUniqueOrThrow({ where: { id: branch.id } })).resolves.toMatchObject({
      name: branch.name,
    });
  });
});
