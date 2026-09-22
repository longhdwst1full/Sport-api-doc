import { BadRequestException, ConflictException } from '@nestjs/common';
import type { PrismaService } from '../../database/prisma.service';
import { CustomerProfileService } from './customer-profile.service';

function buildService(overrides: {
  current?: { id: bigint; email: string | null; phone: string | null; version: bigint } | null;
  updatedCount?: number;
  takenByCustomer?: { normalizedPhone: string | null } | null;
  takenByUser?: { normalizedPhone: string | null } | null;
} = {}) {
  const current =
    overrides.current === undefined
      ? { id: 7n, email: 'cu@example.com', phone: '0912345678', version: 2n }
      : overrides.current;
  const customerUpdateMany = jest
    .fn<Promise<{ count: number }>, [{ where: { version?: bigint } }]>()
    .mockResolvedValue({ count: overrides.updatedCount ?? 1 });
  const userUpdate = jest.fn<Promise<unknown>, [{ data: Record<string, unknown> }]>(
    (args) => {
      void args;
      return Promise.resolve({});
    },
  );
  const prisma = {
    customer: {
      findUnique: jest.fn().mockResolvedValue(current),
      findFirst: jest.fn().mockResolvedValue(overrides.takenByCustomer ?? null),
      updateMany: customerUpdateMany,
    },
    user: {
      findFirst: jest.fn().mockResolvedValue(overrides.takenByUser ?? null),
      update: userUpdate,
    },
    $transaction: (work: (client: unknown) => unknown) =>
      work({
        customer: { updateMany: customerUpdateMany },
        user: { update: userUpdate },
      }),
  } as unknown as PrismaService;
  const service = new CustomerProfileService(prisma);
  // `update` đọc lại hồ sơ sau khi ghi; ở đây chỉ quan tâm nhánh ghi.
  jest.spyOn(service, 'get').mockResolvedValue({ id: '7' } as never);
  return { service, customerUpdateMany, userUpdate };
}

describe('CustomerProfileService.update', () => {
  it('đưa expectedVersion vào điều kiện ghi thay vì kiểm sau khi ghi', async () => {
    const { service, customerUpdateMany } = buildService();

    await service.update('5', { expectedVersion: 2, name: 'Tên mới' });

    expect(customerUpdateMany.mock.calls[0]?.[0].where.version).toBe(2n);
  });

  it('báo xung đột khi version không còn khớp', async () => {
    const { service } = buildService({ updatedCount: 0 });

    await expect(service.update('5', { expectedVersion: 1 })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  /**
   * Định danh đăng nhập nằm ở `users`. Đổi ở hồ sơ mà quên bảng kia thì khách không đăng nhập được
   * bằng chính thông tin họ vừa nhìn thấy trên màn hình.
   */
  it('ghi email mới sang cả bảng tài khoản đăng nhập', async () => {
    const { service, userUpdate } = buildService();

    await service.update('5', { expectedVersion: 2, email: 'moi@example.com' });

    expect(userUpdate.mock.calls[0][0].data).toMatchObject({
      email: 'moi@example.com',
      normalizedEmail: 'moi@example.com',
    });
  });

  it('không cho xoá hết kênh liên hệ', async () => {
    const { service } = buildService({
      current: { id: 7n, email: null, phone: '0912345678', version: 2n },
    });

    await expect(
      service.update('5', { expectedVersion: 2, phone: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  /** Khách vãng lai có hồ sơ mà không có tài khoản; chỉ kiểm một bảng là bỏ lọt trùng. */
  it('chặn khi email đã thuộc về một hồ sơ khách khác', async () => {
    const { service } = buildService({ takenByCustomer: { normalizedPhone: null } });

    await expect(
      service.update('5', { expectedVersion: 2, email: 'trung@example.com' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('chặn khi số điện thoại đã thuộc về một tài khoản khác', async () => {
    const { service } = buildService({ takenByUser: { normalizedPhone: '+84912345679' } });

    await expect(
      service.update('5', { expectedVersion: 2, phone: '0912345679' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
