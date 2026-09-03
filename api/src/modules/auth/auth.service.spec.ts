import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import { UnauthorizedException } from '@nestjs/common';
import { hash } from 'argon2';
import { PrismaService } from '../../database/prisma.service';
import { AuditWriter } from '../audit/audit.writer';
import { AuthService } from './auth.service';

describe('AuthService login protection', () => {
  it('locks atomically on the fifth consecutive wrong password and revokes sessions', async () => {
    let attempts = 0;
    let status = 'ACTIVE';
    const user = {
      id: '00000000-0000-7000-8000-000000000101',
      userType: 'STAFF',
      normalizedEmail: 'staff@example.com',
      passwordHash: await hash('Correct-password-123!'),
      displayName: 'Staff',
      status,
    } as User;
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

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await expect(service.login({ identifier: 'staff@example.com', password: 'Wrong-password!' }, 'STAFF', `request-${attempt}`))
        .rejects.toBeInstanceOf(UnauthorizedException);
    }

    expect(attempts).toBe(5);
    expect(status).toBe('LOCKED');
    expect(transaction.authSession.updateMany).toHaveBeenCalledTimes(1);
    expect(auditWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.account.auto_lock', reason: 'MAX_FAILED_LOGIN_ATTEMPTS' }),
      transaction,
    );
  });
});
