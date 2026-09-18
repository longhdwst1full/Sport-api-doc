import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { MutationContext } from '../../common/request/request-context';
import type { AuthPrincipal } from '../auth/auth.types';
import type { AuditWriter } from '../audit/audit.writer';
import { ScopeType } from '../iam/iam.types';
import { AdminCustomerService } from './admin-customer.service';

const owner: AuthPrincipal = {
  userId: '1',
  sessionId: '1',
  displayName: 'Chủ hệ thống',
  permissionVersion: '1',
  permissions: ['customer.manage'],
  scopes: [{ type: ScopeType.GLOBAL }],
  mustChangePassword: false,
};

const context: MutationContext = { requestId: 'customer-unit-request', actorUserId: '1' };
const branchManager: AuthPrincipal = {
  ...owner,
  scopes: [{ type: ScopeType.BRANCH, branchId: '3' }],
};

function buildService(overrides: {
  existingContact?: unknown;
  loaded?: unknown;
  updatedCount?: number;
  orderCount?: number;
  deletedCount?: number;
} = {}) {
  const create = jest.fn(
    (args: { data: Record<string, unknown> }): Promise<{ id: bigint }> => {
      void args;
      return Promise.resolve({ id: 7n });
    },
  );
  const updateMany = jest.fn().mockResolvedValue({ count: overrides.updatedCount ?? 1 });
  const deleteMany = jest.fn().mockResolvedValue({ count: overrides.deletedCount ?? 1 });
  const orderCount = jest.fn().mockResolvedValue(overrides.orderCount ?? 0);
  const findFirst = jest
    .fn()
    // Lần gọi đầu là kiểm tra trùng liên hệ, các lần sau là nạp hồ sơ theo phạm vi.
    .mockImplementation(({ select }: { select?: Record<string, boolean> }) =>
      select && 'normalizedPhone' in select
        ? Promise.resolve(overrides.existingContact ?? null)
        : Promise.resolve(
            overrides.loaded === undefined
              ? {
                  id: 7n,
                  status: 'ACTIVE',
                  userId: null,
                  phone: '0912345678',
                  email: null,
                  marketingConsent: false,
                  version: 1n,
                }
              : overrides.loaded,
          ),
    );
  const prisma = {
    isEnabled: () => true,
    customer: { create, updateMany, deleteMany, findFirst, findMany: jest.fn(), count: jest.fn() },
    order: { count: orderCount },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn((work: (client: unknown) => unknown) =>
      typeof work === 'function'
        ? work({ customer: { create, updateMany, deleteMany }, order: { count: orderCount } })
        : Promise.all(work as unknown as Promise<unknown>[]),
    ),
  } as unknown as PrismaService;
  const audit = { write: jest.fn().mockResolvedValue({ id: '1', createdAt: '' }) } as unknown as AuditWriter;
  const service = new AdminCustomerService(prisma, audit);
  // `get` đọc lại hồ sơ sau khi ghi; ở đây chỉ quan tâm nhánh ghi.
  jest.spyOn(service, 'get').mockResolvedValue({ id: '7' } as never);
  return { service, create, updateMany, deleteMany };
}

describe('AdminCustomerService tạo và sửa khách', () => {
  it('từ chối hồ sơ không có cách nào liên hệ lại', async () => {
    const { service } = buildService();

    await expect(service.create({ name: 'Khách lẻ' }, owner, context)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('không tạo hồ sơ độc lập bằng branch scope vì bản ghi chưa có quan hệ chi nhánh', async () => {
    const { service, create } = buildService();

    await expect(
      service.create({ name: 'Khách chi nhánh', phone: '0912345678' }, branchManager, context),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(create).not.toHaveBeenCalled();
  });

  it('chuẩn hoá số điện thoại trước khi lưu để tra lại được khách cũ', async () => {
    const { service, create } = buildService();

    await service.create({ name: 'Nguyễn Minh Anh', phone: '0912 345 678' }, owner, context);

    const data = create.mock.calls[0]?.[0].data ?? {};
    expect(data.phone).toBe('0912 345 678');
    expect(data.normalizedPhone).toBe('+84912345678');
    expect(String(data.customerNo)).toMatch(/^CUS-A-/);
  });

  it('chặn tạo trùng số điện thoại để lịch sử mua hàng không bị tách đôi', async () => {
    const { service, create } = buildService({
      existingContact: { normalizedPhone: '+84912345678', normalizedEmail: null },
    });

    await expect(
      service.create({ name: 'Trùng', phone: '0912345678' }, owner, context),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(create).not.toHaveBeenCalled();
  });

  it('báo xung đột khi version không còn khớp', async () => {
    const { service } = buildService({ updatedCount: 0 });

    await expect(
      service.update('7', { expectedVersion: 3, name: 'Tên mới' }, owner, context),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('không cho xoá cả số điện thoại lẫn email của hồ sơ', async () => {
    const { service, updateMany } = buildService();

    await expect(
      service.update('7', { expectedVersion: 1, phone: '', email: '' }, owner, context),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('không cho ngừng hoạt động hồ sơ vốn đã ngừng', async () => {
    const { service } = buildService({ loaded: { id: 7n, status: 'INACTIVE', userId: null } });

    await expect(
      service.deactivate('7', { expectedVersion: 1 }, owner, context),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('AdminCustomerService xoá khách', () => {
  it('xoá được hồ sơ chưa phát sinh đơn', async () => {
    const { service, deleteMany } = buildService();

    await service.remove('7', { expectedVersion: 1 }, owner, context);

    expect(deleteMany).toHaveBeenCalled();
  });

  it('không xoá khách đã có đơn vì lịch sử đơn mất gốc', async () => {
    const { service, deleteMany } = buildService({ orderCount: 4 });

    await expect(service.remove('7', { expectedVersion: 1 }, owner, context)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('không xoá khách có tài khoản đăng nhập', async () => {
    const { service, deleteMany } = buildService({
      loaded: { id: 7n, status: 'ACTIVE', userId: 42n },
    });

    await expect(service.remove('7', { expectedVersion: 1 }, owner, context)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
