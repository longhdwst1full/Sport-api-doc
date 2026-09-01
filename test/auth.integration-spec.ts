import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import { UnauthorizedException } from '@nestjs/common';
import { hash } from 'argon2';
import { v7 as uuidv7 } from 'uuid';
import { PrismaService } from '../src/database/prisma.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { PrismaAuditWriter } from '../src/modules/audit/audit.writer';

describe('Admin authentication', () => {
  const secret = 'integration-test-jwt-secret-at-least-32-chars';
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required for auth integration tests');

  const config = new ConfigService({
    database: { enabled: true, url: databaseUrl },
    app: { jwt: { accessSecret: secret, accessTtlSeconds: 900, refreshTtlSeconds: 3600 } },
  });
  const prisma = new PrismaService(config);
  const cleanup = new PrismaClient({ datasourceUrl: databaseUrl });
  const auth = new AuthService(
    prisma,
    new JwtService({ secret }),
    config,
    new PrismaAuditWriter(prisma),
  );
  const userId = uuidv7();
  const assignmentId = uuidv7();
  const email = `auth-${userId}@example.invalid`;
  const password = 'Valid-password-123!';

  beforeAll(async () => {
    await prisma.$connect();
    const owner = await prisma.role.findUniqueOrThrow({ where: { code: 'OWNER' } });
    await prisma.user.create({
      data: {
        id: userId,
        userType: 'STAFF',
        email,
        normalizedEmail: email,
        passwordHash: await hash(password),
        displayName: 'Auth Integration Owner',
        status: 'ACTIVE',
        permissionVersion: 1,
      },
    });
    await prisma.userRoleAssignment.create({
      data: {
        id: assignmentId,
        userId,
        roleId: owner.id,
        scopeType: 'GLOBAL',
        assignedBy: userId,
      },
    });
  });

  afterAll(async () => {
    await cleanup.authSession.deleteMany({ where: { userId } });
    await cleanup.userRoleAssignment.deleteMany({ where: { userId } });
    await cleanup.user.deleteMany({ where: { id: userId } });
    await Promise.all([prisma.$disconnect(), cleanup.$disconnect()]);
  });

  it('rejects invalid credentials without creating a session', async () => {
    await expect(auth.login({ identifier: email, password: 'incorrect-password' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(prisma.authSession.count({ where: { userId } })).resolves.toBe(0);
  });

  it('rotates refresh tokens once and invalidates stale permission versions', async () => {
    const first = await auth.login({ identifier: email, password });
    const principal = await auth.authorizeAccessToken(first.accessToken);
    expect(principal.userId).toBe(userId);
    expect(principal.permissions).toContain('iam.user.manage');
    expect(principal.scopes).toEqual([{ type: 'GLOBAL' }]);

    const second = await auth.refresh(first.refreshToken);
    await expect(auth.refresh(first.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(auth.authorizeAccessToken(second.accessToken)).resolves.toMatchObject({ userId });

    await prisma.user.update({
      where: { id: userId },
      data: { permissionVersion: { increment: 1 } },
    });
    await expect(auth.authorizeAccessToken(second.accessToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('revokes the presented refresh token on logout', async () => {
    const pair = await auth.login({ identifier: email, password });
    await auth.logout(pair.refreshToken);
    await expect(auth.refresh(pair.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
