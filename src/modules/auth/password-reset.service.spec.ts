import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../database/prisma.service';
import type { AuditWriter } from '../audit/audit.writer';
import type { OutboxWriter } from '../notification/outbox.writer';
import type { IntegrationConfigService } from '../system/parameters/integration-config.service';
import { PasswordResetService } from './password-reset.service';

function buildService(overrides: {
  user?: { id: bigint; email: string | null; displayName: string } | null;
  token?: { id: bigint; userId: bigint; expiresAt: Date; usedAt: Date | null } | null;
  claimedCount?: number;
} = {}) {
  const user =
    overrides.user === undefined
      ? { id: 7n, email: 'khach@example.com', displayName: 'Nguyễn Minh Anh' }
      : overrides.user;
  const tokenCreate = jest
    .fn<Promise<unknown>, [{ data: Record<string, unknown> }]>()
    .mockResolvedValue({});
  const tokenUpdateMany = jest
    .fn<Promise<{ count: number }>, [{ where: Record<string, unknown> }]>()
    .mockResolvedValue({ count: overrides.claimedCount ?? 1 });
  const sessionUpdateMany = jest
    .fn<Promise<{ count: number }>, [{ where: Record<string, unknown>; data: Record<string, unknown> }]>()
    .mockResolvedValue({ count: 3 });
  const userUpdate = jest.fn().mockResolvedValue({});
  const prisma = {
    user: { findFirst: jest.fn().mockResolvedValue(user), update: userUpdate },
    passwordResetToken: {
      findUnique: jest.fn().mockResolvedValue(overrides.token ?? null),
      create: tokenCreate,
      updateMany: tokenUpdateMany,
    },
    authSession: { updateMany: sessionUpdateMany },
    $transaction: (work: (client: unknown) => unknown) =>
      work({
        passwordResetToken: { create: tokenCreate, updateMany: tokenUpdateMany },
        user: { update: userUpdate },
        authSession: { updateMany: sessionUpdateMany },
      }),
  } as unknown as PrismaService;
  const outboxAppend = jest
    .fn<Promise<void>, [{ payload: Record<string, unknown> }]>()
    .mockResolvedValue(undefined);
  const audit = { write: jest.fn().mockResolvedValue({}) } as unknown as AuditWriter;
  const integrations = {
    storefront: jest.fn().mockResolvedValue({ baseUrl: 'https://shop.example.com' }),
  } as unknown as IntegrationConfigService;
  const service = new PasswordResetService(
    prisma,
    audit,
    { append: outboxAppend } as unknown as OutboxWriter,
    integrations,
  );
  return { service, tokenCreate, tokenUpdateMany, sessionUpdateMany, outboxAppend };
}

describe('PasswordResetService.requestReset', () => {
  /**
   * SECURITY: trả lời khác nhau cho email có và không có tài khoản biến endpoint này thành công cụ
   * dò xem ai có tài khoản ở đây.
   */
  it('im lặng bỏ qua email không có tài khoản, không ném lỗi', async () => {
    const { service, tokenCreate, outboxAppend } = buildService({ user: null });

    await expect(
      service.requestReset({ email: 'khong-ton-tai@example.com' }, 'req-1'),
    ).resolves.toBeUndefined();
    expect(tokenCreate).not.toHaveBeenCalled();
    expect(outboxAppend).not.toHaveBeenCalled();
  });

  it('chỉ lưu hash của token, không lưu token thô', async () => {
    const { service, tokenCreate, outboxAppend } = buildService();

    await service.requestReset({ email: 'khach@example.com' }, 'req-1');

    const saved = tokenCreate.mock.calls[0][0].data;
    const sentUrl = outboxAppend.mock.calls[0][0].payload.resetUrl as string;
    const rawToken = new URL(sentUrl).searchParams.get('token');
    expect(rawToken).toBeTruthy();
    expect(saved.tokenHash).not.toBe(rawToken);
    expect(String(saved.tokenHash)).toHaveLength(64);
  });

  /** Bấm "quên mật khẩu" ba lần thì hai link cũ không được phép còn tác dụng. */
  it('huỷ token chưa dùng trước đó của cùng người', async () => {
    const { service, tokenUpdateMany } = buildService();

    await service.requestReset({ email: 'khach@example.com' }, 'req-1');

    expect(tokenUpdateMany.mock.calls[0][0].where).toMatchObject({ userId: 7n, usedAt: null });
  });
});

describe('PasswordResetService.resetPassword', () => {
  const future = new Date(Date.now() + 10 * 60_000);

  it('từ chối token đã dùng', async () => {
    const { service } = buildService({
      token: { id: 1n, userId: 7n, expiresAt: future, usedAt: new Date() },
    });

    await expect(
      service.resetPassword({ token: 'x'.repeat(40), newPassword: 'mat-khau-moi' }, 'req-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('từ chối token hết hạn', async () => {
    const { service } = buildService({
      token: { id: 1n, userId: 7n, expiresAt: new Date(Date.now() - 1000), usedAt: null },
    });

    await expect(
      service.resetPassword({ token: 'x'.repeat(40), newPassword: 'mat-khau-moi' }, 'req-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  /**
   * Khác với đổi mật khẩu khi đã đăng nhập: ở đây người dùng vừa lấy lại tài khoản qua email, mọi
   * phiên đang mở đều có khả năng là của người chiếm tài khoản.
   */
  it('thu hồi toàn bộ phiên, không chừa phiên nào', async () => {
    const { service, sessionUpdateMany } = buildService({
      token: { id: 1n, userId: 7n, expiresAt: future, usedAt: null },
    });

    await service.resetPassword({ token: 'x'.repeat(40), newPassword: 'mat-khau-moi' }, 'req-1');

    const call = sessionUpdateMany.mock.calls[0][0];
    expect(call.where).toEqual({ userId: 7n, revokedAt: null });
    expect(call.data).toMatchObject({ revokeReason: 'PASSWORD_RESET' });
  });

  it('hai lần bấm đồng thời chỉ một lần thắng', async () => {
    const { service } = buildService({
      token: { id: 1n, userId: 7n, expiresAt: future, usedAt: null },
      claimedCount: 0,
    });

    await expect(
      service.resetPassword({ token: 'x'.repeat(40), newPassword: 'mat-khau-moi' }, 'req-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
