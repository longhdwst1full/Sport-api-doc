import { Prisma, PrismaClient } from '@prisma/client';
import { hash } from 'argon2';
import { v7 as uuidv7 } from 'uuid';
import { IAM_SECURITY_DEFAULTS, USER_STATUS, USER_TYPE } from '../src/modules/iam/iam.constants';
import { PERMISSION_CATALOG, V1_ROLE_PERMISSIONS } from '../src/modules/iam/iam.permissions';
import { BOOTSTRAP_ADMIN } from '../src/modules/iam/bootstrap-admin.constants';

const prisma = new PrismaClient();

const ids = {
  branch: '00000000-0000-7000-8000-000000000001',
  warehouse: '00000000-0000-7000-8000-000000000002',
  bootstrapUser: BOOTSTRAP_ADMIN.ID,
  ownerRole: '00000000-0000-7000-8000-000000000120',
  branchManagerRole: '00000000-0000-7000-8000-000000000121',
  staffRole: '00000000-0000-7000-8000-000000000122',
  ownerAssignment: '00000000-0000-7000-8000-000000000130',
} as const;

async function seed(transaction: Prisma.TransactionClient): Promise<void> {
  await transaction.branch.upsert({
    where: { code: 'CN-HCM-01' },
    update: { name: 'Chi nhánh Hồ Chí Minh', status: 'ACTIVE' },
    create: {
      id: ids.branch,
      code: 'CN-HCM-01',
      name: 'Chi nhánh Hồ Chí Minh',
      status: 'ACTIVE',
      addressJson: {
        addressLine: 'Dữ liệu demo - cập nhật trước UAT',
        district: 'Quận 7',
        province: 'TP. Hồ Chí Minh',
      },
    },
  });

  const branch = await transaction.branch.findUniqueOrThrow({ where: { code: 'CN-HCM-01' } });
  await transaction.warehouse.upsert({
    where: { code: 'KHO-HCM-01' },
    update: { branchId: branch.id, name: 'Kho bán hàng Hồ Chí Minh', status: 'ACTIVE' },
    create: {
      id: ids.warehouse,
      branchId: branch.id,
      code: 'KHO-HCM-01',
      name: 'Kho bán hàng Hồ Chí Minh',
      status: 'ACTIVE',
      isPrimary: true,
    },
  });

  const existingBootstrapUser = await transaction.user.findUnique({
    where: { id: ids.bootstrapUser },
    select: { passwordHash: true },
  });
  const bootstrapPasswordHash = existingBootstrapUser?.passwordHash
    ?? await hash(IAM_SECURITY_DEFAULTS.INITIAL_STAFF_PASSWORD);
  const initializeBootstrapCredential = !existingBootstrapUser?.passwordHash;

  await transaction.user.upsert({
    where: { id: ids.bootstrapUser },
    update: {
      displayName: BOOTSTRAP_ADMIN.DISPLAY_NAME,
      ...(initializeBootstrapCredential
        ? {
            passwordHash: bootstrapPasswordHash,
            status: USER_STATUS.ACTIVE,
            mustChangePassword: true,
            failedLoginAttempts: 0,
            lockedAt: null,
            lockReason: null,
          }
        : {}),
    },
    create: {
      id: ids.bootstrapUser,
      userType: USER_TYPE.STAFF,
      email: BOOTSTRAP_ADMIN.EMAIL,
      normalizedEmail: BOOTSTRAP_ADMIN.EMAIL,
      passwordHash: bootstrapPasswordHash,
      displayName: BOOTSTRAP_ADMIN.DISPLAY_NAME,
      status: USER_STATUS.ACTIVE,
      mustChangePassword: true,
    },
  });

  for (const permission of PERMISSION_CATALOG) {
    await transaction.permission.upsert({
      where: { code: permission.code },
      update: {
        module: permission.module,
        action: permission.action,
        isSensitive: permission.sensitive,
      },
      create: {
        id: uuidv7(),
        code: permission.code,
        module: permission.module,
        action: permission.action,
        isSensitive: permission.sensitive,
      },
    });
  }

  const retiredRoleCodes = ['SUPER_ADMIN', 'CATALOG_MANAGER', 'PRICING_MANAGER'];
  const retiredRoles = await transaction.role.findMany({
    where: { code: { in: retiredRoleCodes } },
    select: { id: true },
  });
  if (retiredRoles.length > 0) {
    const now = new Date();
    await transaction.userRoleAssignment.updateMany({
      where: {
        roleId: { in: retiredRoles.map(({ id }) => id) },
        status: 'ACTIVE',
      },
      data: { status: 'REVOKED', validTo: now },
    });
    await transaction.role.updateMany({
      where: { id: { in: retiredRoles.map(({ id }) => id) } },
      data: { status: 'INACTIVE' },
    });
  }

  const roleSeeds = [
    {
      id: ids.ownerRole,
      code: 'OWNER',
      name: 'Quản trị viên gốc',
      permissionCodes: V1_ROLE_PERMISSIONS.OWNER,
    },
    {
      id: ids.branchManagerRole,
      code: 'BRANCH_MANAGER',
      name: 'Quản lý chi nhánh',
      permissionCodes: V1_ROLE_PERMISSIONS.BRANCH_MANAGER,
    },
    {
      id: ids.staffRole,
      code: 'STAFF',
      name: 'Nhân viên',
      permissionCodes: V1_ROLE_PERMISSIONS.STAFF,
    },
  ];

  for (const roleSeed of roleSeeds) {
    const role = await transaction.role.upsert({
      where: { code: roleSeed.code },
      update: { name: roleSeed.name, status: 'ACTIVE', isSystem: true },
      create: {
        id: roleSeed.id,
        code: roleSeed.code,
        name: roleSeed.name,
        status: 'ACTIVE',
        isSystem: true,
      },
    });
    const permissions = await transaction.permission.findMany({
      where: { code: { in: roleSeed.permissionCodes } },
      select: { id: true },
    });
    const permissionIds = permissions.map(({ id }) => id);
    await transaction.rolePermission.deleteMany({
      where: {
        roleId: role.id,
        permissionId: { notIn: permissionIds },
      },
    });
    await transaction.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    });
  }

  const ownerRole = await transaction.role.findUniqueOrThrow({
    where: { code: 'OWNER' },
  });
  const assignment = await transaction.userRoleAssignment.findFirst({
    where: {
      userId: ids.bootstrapUser,
      roleId: ownerRole.id,
      scopeType: 'GLOBAL',
      status: 'ACTIVE',
    },
  });
  if (!assignment) {
    await transaction.userRoleAssignment.create({
      data: {
        id: ids.ownerAssignment,
        userId: ids.bootstrapUser,
        roleId: ownerRole.id,
        scopeType: 'GLOBAL',
        assignedBy: ids.bootstrapUser,
      },
    });
  }

  const unexpectedOwnerAssignment = await transaction.userRoleAssignment.findFirst({
    where: {
      roleId: ownerRole.id,
      status: 'ACTIVE',
      userId: { not: ids.bootstrapUser },
    },
    select: { id: true, userId: true },
  });
  if (unexpectedOwnerAssignment) {
    throw new Error(
      `Single-root-admin invariant violated by OWNER assignment ${unexpectedOwnerAssignment.id} `
      + `for user ${unexpectedOwnerAssignment.userId}; revoke it explicitly before seeding`,
    );
  }
}

async function main(): Promise<void> {
  await prisma.$transaction(seed, { maxWait: 10_000, timeout: 120_000 });
}

void main().finally(async () => prisma.$disconnect());
