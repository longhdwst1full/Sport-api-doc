import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import { UnauthorizedException } from '@nestjs/common';
import { hash } from 'argon2';
import { PrismaService } from '../../database/prisma.service';
import { AuditWriter } from '../audit/audit.writer';
import { AUTH_ERROR } from './auth.constants';
import { AuthService } from './auth.service';

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
