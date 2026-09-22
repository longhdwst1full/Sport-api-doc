import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import { UnauthorizedException } from '@nestjs/common';
import { hash } from 'argon2';
import { PrismaService } from '../../database/prisma.service';
import { AuditWriter } from '../audit/audit.writer';
import { AUTH_ERROR } from './auth.constants';
import { AuthService } from './auth.service';
import type { OutboxWriter } from '../notification/outbox.writer';

describe('AuthService login protection', () => {
  it('locks atomically on the fifth consecutive wrong password and revokes sessions', async () => {
    let attempts = 0;
    let status = 'ACTIVE';
    const user = {
      id: 101n,
      userType: 'STAFF',
      normalizedEmail: 'staff@example.com',
      passwordHash: await hash('Correct-password-123!'),
      displayName: 'Staff',
      status,
    } as unknown as User;
    const transaction = {
      $queryRaw: jest.fn().mockImplementation(() => {
        attempts += 1;
        if (attempts >= 5) status = 'LOCKED';
        return [{ status, failedLoginAttempts: attempts, lockedAt: new Date() }];
      }),
      authSession: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    const prisma = {
      isEnabled: jest.fn().mockReturnValue(true),
      user: {
        findFirst: jest.fn().mockImplementation(() => Promise.resolve({ ...user, status })),
      },
      $transaction: jest.fn((work: (client: typeof transaction) => unknown) => work(transaction)),
    } as unknown as PrismaService;
    const auditWrite = jest.fn().mockResolvedValue({ id: 'audit', createdAt: '' });
    const audit = { write: auditWrite } as unknown as AuditWriter;
    const service = new AuthService(
      prisma,
      {} as JwtService,
      new ConfigService(),
      audit,
      { append: jest.fn().mockResolvedValue(undefined) } as unknown as OutboxWriter,
    );

    for (let attempt = 1; attempt < 5; attempt += 1) {
      await expect(service.login({ identifier: 'staff@example.com', password: 'Wrong-password!' }, 'STAFF', `request-${attempt}`))
        .rejects.toBeInstanceOf(UnauthorizedException);
    }
    await expect(
      service.login(
        { identifier: 'staff@example.com', password: 'Wrong-password!' },
        'STAFF',
        'request-5',
      ),
    ).rejects.toMatchObject({ response: AUTH_ERROR.ACCOUNT_LOCKED });

    expect(attempts).toBe(5);
    expect(status).toBe('LOCKED');
    expect(transaction.authSession.updateMany).toHaveBeenCalledTimes(1);
    expect(auditWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.account.auto_lock', reason: 'MAX_FAILED_LOGIN_ATTEMPTS' }),
      transaction,
    );
  });

  it('reports an already locked account without incrementing attempts again', async () => {
    const transactionRunner = jest.fn();
    const prisma = {
      isEnabled: jest.fn().mockReturnValue(true),
      user: {
        findFirst: jest.fn().mockResolvedValue({
          passwordHash: await hash('Correct-password-123!'),
          status: 'LOCKED',
        }),
      },
      $transaction: transactionRunner,
    } as unknown as PrismaService;
    const service = new AuthService(
      prisma,
      {} as JwtService,
      new ConfigService(),
      { write: jest.fn() } as unknown as AuditWriter,
      { append: jest.fn().mockResolvedValue(undefined) } as unknown as OutboxWriter,
    );

    await expect(
      service.login({ identifier: 'staff@example.com', password: 'Correct-password-123!' }),
    ).rejects.toMatchObject({ response: AUTH_ERROR.ACCOUNT_LOCKED });
    expect(transactionRunner).not.toHaveBeenCalled();
  });

  it('resets failed attempts and lock metadata after a successful login', async () => {
    const user = {
      id: 102n,
      userType: 'STAFF',
      normalizedEmail: 'staff.success@example.com',
      passwordHash: await hash('Correct-password-123!'),
      displayName: 'Successful Staff',
      status: 'ACTIVE',
      failedLoginAttempts: 3,
      permissionVersion: 7n,
      mustChangePassword: false,
    } as unknown as User;
    const updateMany = jest.fn((input: unknown) => {
      void input;
      return Promise.resolve({ count: 1 });
    });
    const transaction = {
      user: { updateMany },
      authSession: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      isEnabled: jest.fn().mockReturnValue(true),
      user: { findFirst: jest.fn().mockResolvedValue(user) },
      $transaction: jest.fn((work: (client: typeof transaction) => unknown) => work(transaction)),
    } as unknown as PrismaService;
    const jwt = { signAsync: jest.fn().mockResolvedValue('access-token') } as unknown as JwtService;
    const service = new AuthService(
      prisma,
      jwt,
      new ConfigService({ app: { jwt: { accessTtlSeconds: 900, refreshTtlSeconds: 3600 } } }),
      { write: jest.fn() } as unknown as AuditWriter,
      { append: jest.fn().mockResolvedValue(undefined) } as unknown as OutboxWriter,
    );

    await expect(
      service.login({
        identifier: `  ${user.normalizedEmail!}  `,
        password: '  Correct-password-123!  ',
      }),
    ).resolves.toMatchObject({ accessToken: 'access-token' });
    expect(updateMany).toHaveBeenCalled();
    const resetInput = updateMany.mock.calls[0]?.[0] as {
      where: { id: string; status: string };
      data: { failedLoginAttempts: number; lockedAt: null; lockReason: null };
    } | undefined;
    expect(resetInput?.where).toEqual({ id: user.id, status: 'ACTIVE' });
    expect(resetInput?.data).toMatchObject({
      failedLoginAttempts: 0,
      lockedAt: null,
      lockReason: null,
    });
  });
});

describe('AuthService permission grant cache', () => {
  const buildService = () => {
    const session = {
      id: 9n,
      user: {
        id: 101n,
        displayName: 'Owner',
        status: 'ACTIVE',
        permissionVersion: 3n,
        mustChangePassword: false,
      },
    };
    const findManyAssignments = jest.fn().mockResolvedValue([
      {
        scopeType: 'BRANCH',
        branchId: 7n,
        validTo: null,
        role: { permissions: [{ permission: { code: 'catalog.product.view' } }] },
      },
    ]);
    const prisma = {
      isEnabled: jest.fn().mockReturnValue(true),
      authSession: { findFirst: jest.fn().mockResolvedValue(session) },
      userRoleAssignment: { findMany: findManyAssignments },
    } as unknown as PrismaService;
    const jwt = {
      verifyAsync: jest.fn().mockResolvedValue({ sub: '101', sid: '9', pv: '3', typ: 'access' }),
    } as unknown as JwtService;
    const service = new AuthService(
      prisma,
      jwt,
      new ConfigService(),
      { write: jest.fn() } as unknown as AuditWriter,
      { append: jest.fn().mockResolvedValue(undefined) } as unknown as OutboxWriter,
    );
    return { service, session, findManyAssignments, jwt };
  };

  it('resolves permissions and scopes once per user permission version', async () => {
    const { service, findManyAssignments } = buildService();

    const first = await service.authorizeAccessToken('token');
    const second = await service.authorizeAccessToken('token');

    expect(first.permissions).toEqual(['catalog.product.view']);
    expect(first.scopes).toHaveLength(1);
    expect(first.scopes[0].type).toBe('BRANCH');
    expect(typeof first.scopes[0].branchId).toBe('string');
    expect(first.permissionVersion).toBe('3');
    expect(second).toEqual(first);
    expect(findManyAssignments).toHaveBeenCalledTimes(1);
  });

  it('rebuilds grants when the permission version changes', async () => {
    const { service, session, findManyAssignments, jwt } = buildService();
    await service.authorizeAccessToken('token');

    session.user.permissionVersion = 4n;
    (jwt.verifyAsync as jest.Mock).mockResolvedValue({
      sub: '101',
      sid: '9',
      pv: '4',
      typ: 'access',
    });
    const refreshed = await service.authorizeAccessToken('token');

    expect(refreshed.permissionVersion).toBe('4');
    expect(findManyAssignments).toHaveBeenCalledTimes(2);
  });

  it('rejects a token whose permission version no longer matches the user', async () => {
    const { service, jwt } = buildService();
    (jwt.verifyAsync as jest.Mock).mockResolvedValue({
      sub: '101',
      sid: '9',
      pv: '2',
      typ: 'access',
    });

    await expect(service.authorizeAccessToken('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('never caches a grant that expires on its own, because expiry does not bump the version', async () => {
    const { service, findManyAssignments } = buildService();
    findManyAssignments.mockResolvedValue([
      {
        scopeType: 'GLOBAL',
        branchId: null,
        validTo: new Date(Date.now() + 3_600_000),
        role: { permissions: [{ permission: { code: 'order.view' } }] },
      },
    ]);

    await service.authorizeAccessToken('token');
    await service.authorizeAccessToken('token');

    expect(findManyAssignments).toHaveBeenCalledTimes(2);
  });
});
