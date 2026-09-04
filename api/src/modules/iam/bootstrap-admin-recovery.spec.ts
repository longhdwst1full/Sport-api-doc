import { PrismaClient } from '@prisma/client';
import { resetBootstrapAdmin } from './bootstrap-admin-recovery';
import { BOOTSTRAP_ADMIN } from './bootstrap-admin.constants';

function createPrisma(user: Record<string, unknown> | null) {
  const captured: { userUpdate?: unknown; auditCreate?: unknown } = {};
  const transaction = {
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
      update: jest.fn((input: unknown) => {
        captured.userUpdate = input;
        return Promise.resolve({});
      }),
    },
    authSession: {
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    auditLog: {
      create: jest.fn((input: unknown) => {
        captured.auditCreate = input;
        return Promise.resolve({});
      }),
    },
  };
  type TransactionOperation = (client: typeof transaction) => Promise<unknown>;
  const prisma = {
    $transaction: jest.fn((operation: TransactionOperation) => operation(transaction)),
  } as unknown as PrismaClient;
  return { prisma, transaction, captured };
}

describe('resetBootstrapAdmin', () => {
  const lockedOwner = {
    id: BOOTSTRAP_ADMIN.ID,
    userType: 'STAFF',
    normalizedEmail: BOOTSTRAP_ADMIN.EMAIL,
    status: 'LOCKED',
    failedLoginAttempts: 5,
    mustChangePassword: true,
    roleAssignments: [{ role: { code: 'OWNER', status: 'ACTIVE' } }],
  };

  it('activates only the bootstrap OWNER, revokes sessions, and writes audit atomically', async () => {
    const { prisma, transaction, captured } = createPrisma(lockedOwner);

    await expect(resetBootstrapAdmin(prisma, () => Promise.resolve('argon2-hash'))).resolves.toEqual({
      email: BOOTSTRAP_ADMIN.EMAIL,
      status: 'ACTIVE',
      mustChangePassword: true,
      revokedSessionCount: 2,
    });
    expect(captured.userUpdate).toMatchObject({
      where: { id: BOOTSTRAP_ADMIN.ID },
      data: {
        passwordHash: 'argon2-hash',
        status: 'ACTIVE',
        failedLoginAttempts: 0,
        mustChangePassword: true,
        lockedAt: null,
        lockReason: null,
      },
    });
    expect(transaction.authSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: BOOTSTRAP_ADMIN.ID, revokedAt: null },
    }));
    expect(captured.auditCreate).toMatchObject({
      data: {
        actorType: 'SYSTEM',
        action: BOOTSTRAP_ADMIN.AUDIT_ACTION,
        entityId: BOOTSTRAP_ADMIN.ID,
      },
    });
  });

  it('fails closed when the fixed bootstrap identity is missing', async () => {
    const { prisma, transaction } = createPrisma(null);
    await expect(resetBootstrapAdmin(prisma, () => Promise.resolve('argon2-hash'))).rejects.toThrow(
      'Bootstrap administrator was not found',
    );
    expect(transaction.user.update).not.toHaveBeenCalled();
  });

  it('fails closed when the account is not an active global OWNER assignment', async () => {
    const { prisma, transaction } = createPrisma({ ...lockedOwner, roleAssignments: [] });
    await expect(resetBootstrapAdmin(prisma, () => Promise.resolve('argon2-hash'))).rejects.toThrow(
      'Bootstrap administrator identity or OWNER assignment is invalid',
    );
    expect(transaction.user.update).not.toHaveBeenCalled();
  });
});
