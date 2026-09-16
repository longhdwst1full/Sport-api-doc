import { PrismaService } from '../../database/prisma.service';
import { AuditWriter } from '../audit/audit.writer';
import { PrismaIamRepository } from './prisma-iam.repository';

/**
 * Đổi vai trò sang INACTIVE làm người được gán mất quyền, nhưng lời gọi đó không kèm
 * `permissionCodes`. Bản trước đặt lệnh tăng `permissionVersion` bên trong nhánh
 * `permissionCodes`, nên người dùng giữ nguyên quyền cũ tới khi token hết hạn — vẫn thao
 * tác được bằng vai trò vừa bị vô hiệu hoá.
 */
describe('PrismaIamRepository tăng permissionVersion khi vai trò đổi trạng thái', () => {
  const userUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
  const roleUpdateMany = jest.fn().mockResolvedValue({ count: 1 });

  const roleRow = {
    id: 7n,
    code: 'BRANCH_STAFF',
    name: 'Nhân viên chi nhánh',
    description: null,
    status: 'ACTIVE',
    version: 3n,
    permissions: [],
  };

  const prisma = {
    isEnabled: jest.fn().mockReturnValue(true),
    role: { findUnique: jest.fn().mockResolvedValue(roleRow) },
    permission: { findMany: jest.fn().mockResolvedValue([]) },
    rolePermission: { deleteMany: jest.fn(), createMany: jest.fn() },
    user: { updateMany: userUpdateMany },
    $transaction: jest.fn(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          role: { updateMany: roleUpdateMany },
          permission: { findMany: jest.fn().mockResolvedValue([]) },
          rolePermission: { deleteMany: jest.fn(), createMany: jest.fn() },
          user: { updateMany: userUpdateMany },
        }),
    ),
  } as unknown as PrismaService;

  const audit = { write: jest.fn().mockResolvedValue({ id: '1', createdAt: '' }) } as unknown as AuditWriter;
  const context = { requestId: 'unit', actorUserId: '1' };

  beforeEach(() => jest.clearAllMocks());

  it('chuyển vai trò sang INACTIVE thì buộc cấp lại quyền', async () => {
    const repository = new PrismaIamRepository(prisma, audit);

    await repository.updateRole('7', { expectedVersion: 3, status: 'INACTIVE' }, context);

    expect(userUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { permissionVersion: { increment: 1 } } }),
    );
  });

  it('kích hoạt lại vai trò cũng buộc cấp lại quyền', async () => {
    const repository = new PrismaIamRepository(prisma, audit);
    prisma.role.findUnique = jest.fn().mockResolvedValue({ ...roleRow, status: 'INACTIVE' });

    await repository.updateRole('7', { expectedVersion: 3, status: 'ACTIVE' }, context);

    expect(userUpdateMany).toHaveBeenCalled();
  });

  /**
   * Đổi tên mô tả không làm thay đổi quyền hiệu lực; tăng phiên bản ở đây chỉ khiến mọi
   * người đang làm việc bị đá ra đăng nhập lại mà không có lý do.
   */
  it('đổi tên vai trò thì không đụng tới phiên đăng nhập', async () => {
    const repository = new PrismaIamRepository(prisma, audit);
    prisma.role.findUnique = jest.fn().mockResolvedValue(roleRow);

    await repository.updateRole('7', { expectedVersion: 3, name: 'Tên mới' }, context);

    expect(userUpdateMany).not.toHaveBeenCalled();
  });
});
