import { PrismaService } from '../../database/prisma.service';
import type { AuditWriter } from '../audit/audit.writer';
import type { AuthPrincipal } from './auth.types';
import { AuthService } from './auth.service';
import { hash } from 'argon2';
import type { OutboxWriter } from '../notification/outbox.writer';

/**
 * Đổi mật khẩu phải đá mọi phiên KHÁC ra ngoài.
 *
 * Người ta đổi mật khẩu thường vì nghi có người khác đang dùng tài khoản mình. Giữ nguyên các phiên
 * đang mở nghĩa là kẻ đó vẫn ở trong hệ thống với refresh token cũ cho tới khi nó hết hạn — đúng
 * thứ mà thao tác đổi mật khẩu lẽ ra phải chặn.
 */
describe('AuthService.changePassword thu hồi phiên', () => {
  const principal: AuthPrincipal = {
    userId: '7',
    sessionId: '42',
    displayName: 'Khách',
    permissionVersion: '1',
    permissions: [],
    scopes: [],
    mustChangePassword: false,
  };

  async function buildService() {
    const passwordHash = await hash('mat-khau-cu');
    const sessionUpdateMany = jest
      .fn<Promise<{ count: number }>, [{ where: Record<string, unknown> }]>()
      .mockResolvedValue({ count: 2 });
    const auditWrite = jest
      .fn<Promise<{ id: string; createdAt: string }>, [{ after?: unknown }]>()
      .mockResolvedValue({ id: '1', createdAt: '' });
    const userUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      isEnabled: () => true,
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 7n,
          passwordHash,
          status: 'ACTIVE',
          version: 3n,
          mustChangePassword: false,
        }),
        updateMany: userUpdateMany,
      },
      authSession: { updateMany: sessionUpdateMany },
      $transaction: (work: (client: unknown) => unknown) =>
        work({
          user: { updateMany: userUpdateMany },
          authSession: { updateMany: sessionUpdateMany },
        }),
    } as unknown as PrismaService;
    const audit = { write: auditWrite } as unknown as AuditWriter;
    const service = new AuthService(
      prisma,
      { verifyAsync: jest.fn(), signAsync: jest.fn() } as never,
      { get: jest.fn().mockReturnValue(900) } as never,
      audit,
      { append: jest.fn().mockResolvedValue(undefined) } as unknown as OutboxWriter,
    );
    return { service, sessionUpdateMany, auditWrite };
  }

  it('thu hồi mọi phiên trừ phiên đang thao tác', async () => {
    const { service, sessionUpdateMany } = await buildService();

    await service.changePassword(
      principal,
      { currentPassword: 'mat-khau-cu', newPassword: 'mat-khau-moi' },
      'request-1',
    );

    const where = sessionUpdateMany.mock.calls[0]?.[0].where;
    expect(where).toMatchObject({ userId: 7n, revokedAt: null, id: { not: 42n } });
  });

  it('ghi số phiên đã thu hồi vào audit mà không chép mật khẩu', async () => {
    const { service, auditWrite } = await buildService();

    await service.changePassword(
      principal,
      { currentPassword: 'mat-khau-cu', newPassword: 'mat-khau-moi' },
      'request-1',
    );

    const entry = auditWrite.mock.calls[0][0];
    expect(entry.after).toMatchObject({ revokedSessions: 2 });
    expect(JSON.stringify(entry)).not.toContain('mat-khau');
  });
});
