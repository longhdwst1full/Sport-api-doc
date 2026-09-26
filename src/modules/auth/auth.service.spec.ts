import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hash } from 'argon2';
import { PrismaService } from '../../database/prisma.service';
import { AuditWriter } from '../audit/audit.writer';
import { AUTH_ERROR } from './auth.constants';
import { AuthService } from './auth.service';
import type { OutboxWriter } from '../notification/outbox.writer';

/**
 * Tham số argon2 nhẹ chỉ cho test: `verify` đọc tham số từ chính chuỗi hash nên cũng nhẹ theo.
 * Tham số mặc định (64 MiB, 3 vòng) nhân với 5 lần đăng nhập sai làm ca khoá tài khoản chậm hẳn
 * khi cả suite chạy song song; logic đếm/khoá không phụ thuộc độ mạnh của hash.
 */
const hashForTest = (password: string) => hash(password, { memoryCost: 1024, timeCost: 1 });

describe('AuthService login protection', () => {
  it('locks atomically on the fifth consecutive wrong password and revokes sessions', async () => {
    let attempts = 0;
    let status = 'ACTIVE';
    const user = {
      id: 101n,
      userType: 'STAFF',
      normalizedEmail: 'staff@example.com',
      passwordHash: await hashForTest('Correct-password-123!'),
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
          passwordHash: await hashForTest('Correct-password-123!'),
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
      passwordHash: await hashForTest('Correct-password-123!'),
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

describe('AuthService refresh rotation', () => {
  const activeUser = { id: 101n, status: 'ACTIVE', displayName: 'Owner', permissionVersion: 1n, mustChangePassword: false };
  const conflict = () => new Prisma.PrismaClientKnownRequestError('serialization failure', { code: 'P2034', clientVersion: 'test' });

  function buildRefreshService(options: { session?: Record<string, unknown> | null; revokeCount?: number; failures?: Error[] } = {}) {
    const failures: Error[] = [...(options.failures ?? [])];
    const createSession = jest.fn().mockResolvedValue({});
    const transaction = {
      authSession: {
        findUnique: jest.fn().mockResolvedValue(options.session === undefined
          ? { id: 9n, revokedAt: null, revokeReason: null, expiresAt: new Date(Date.now() + 60_000), user: activeUser }
          : options.session),
        updateMany: jest.fn().mockResolvedValue({ count: options.revokeCount ?? 1 }),
        create: createSession,
      },
    };
    const $transaction = jest.fn((work: (client: typeof transaction) => unknown) => {
      const failure = failures.shift();
      return failure ? Promise.reject(failure) : Promise.resolve(work(transaction));
    });
    const prisma = { isEnabled: jest.fn().mockReturnValue(true), $transaction } as unknown as PrismaService;
    const service = new AuthService(
      prisma,
      { signAsync: jest.fn().mockResolvedValue('access-token') } as unknown as JwtService,
      new ConfigService({ app: { jwt: { accessTtlSeconds: 900, refreshTtlSeconds: 3600 } } }),
      { write: jest.fn() } as unknown as AuditWriter,
      { append: jest.fn().mockResolvedValue(undefined) } as unknown as OutboxWriter,
    );
    return { service, transaction, $transaction };
  }

  it('xoay session: cũ ROTATED, cấp session kế tiếp trỏ về session cũ', async () => {
    const { service, transaction } = buildRefreshService();

    await expect(service.refresh('refresh-token')).resolves.toMatchObject({ accessToken: 'access-token' });
    expect(transaction.authSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 9n, revokedAt: null },
      data: expect.objectContaining({ revokeReason: 'ROTATED' }) as unknown,
    }));
  });

  it('token đã xoay dùng lại → 401 AUTH_REFRESH_REUSED', async () => {
    const { service } = buildRefreshService({
      session: { id: 9n, revokedAt: new Date(), revokeReason: 'ROTATED', expiresAt: new Date(Date.now() + 60_000), user: activeUser },
    });

    await expect(service.refresh('refresh-token')).rejects.toMatchObject({ response: { code: 'AUTH_REFRESH_REUSED' } });
  });

  it('thua race khi thu hồi → 401 AUTH_REFRESH_REUSED', async () => {
    const { service } = buildRefreshService({ revokeCount: 0 });

    await expect(service.refresh('refresh-token')).rejects.toMatchObject({ response: { code: 'AUTH_REFRESH_REUSED' } });
  });

  it.each([
    ['không tồn tại', null],
    ['đã đăng xuất', { id: 9n, revokedAt: new Date(), revokeReason: 'LOGOUT', expiresAt: new Date(Date.now() + 60_000), user: activeUser }],
    ['hết hạn', { id: 9n, revokedAt: null, revokeReason: null, expiresAt: new Date(Date.now() - 1), user: activeUser }],
  ])('token %s → 401 AUTH_REFRESH_INVALID', async (_case, session) => {
    const { service } = buildRefreshService({ session });

    await expect(service.refresh('refresh-token')).rejects.toMatchObject({ response: { code: 'AUTH_REFRESH_INVALID' } });
  });

  it('xung đột serialization một lần thì tự chạy lại và thành công', async () => {
    const { service, $transaction } = buildRefreshService({ failures: [conflict()] });

    await expect(service.refresh('refresh-token')).resolves.toMatchObject({ accessToken: 'access-token' });
    expect($transaction).toHaveBeenCalledTimes(2);
  });

  it('xung đột serialization kéo dài → 409 AUTH_REFRESH_CONFLICT (FE thử lại, không đăng xuất)', async () => {
    const { service } = buildRefreshService({ failures: [conflict(), conflict()] });

    const error = await service.refresh('refresh-token').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConflictException);
    expect(error).toMatchObject({ response: { code: 'AUTH_REFRESH_CONFLICT' } });
  });

  it('access token cấp trước lần xoay vẫn hợp lệ khi session kế tiếp còn sống', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 9n, user: activeUser });
    const service = new AuthService(
      {
        isEnabled: jest.fn().mockReturnValue(true),
        authSession: { findFirst },
        userRoleAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      } as unknown as PrismaService,
      { verifyAsync: jest.fn().mockResolvedValue({ sub: '101', sid: '9', pv: '1', typ: 'access' }) } as unknown as JwtService,
      new ConfigService({ app: { jwt: { accessTtlSeconds: 900 } } }),
      { write: jest.fn() } as unknown as AuditWriter,
      { append: jest.fn() } as unknown as OutboxWriter,
    );

    await service.authorizeAccessToken('token');
    const where = (findFirst.mock.calls[0] as [{ where: { OR: Array<Record<string, unknown>> } }])[0].where;
    expect(where.OR[0]).toEqual({ revokedAt: null });
    expect(where.OR[1]).toMatchObject({
      revokeReason: 'ROTATED',
      rotations: { some: { revokedAt: null } },
    });
    const rotatedAfter = (where.OR[1].revokedAt as { gt: Date }).gt.getTime();
    expect(Date.now() - rotatedAfter).toBeGreaterThanOrEqual(900_000 - 1_000);
    expect(Date.now() - rotatedAfter).toBeLessThanOrEqual(900_000 + 1_000);
  });
});

