import { Prisma, PrismaClient } from '@prisma/client';
import { PERMISSION_CATALOG } from '../src/modules/iam/iam.permissions';

const prisma = new PrismaClient();

const ids = {
  branch: '00000000-0000-7000-8000-000000000001',
  warehouse: '00000000-0000-7000-8000-000000000002',
  bootstrapUser: '00000000-0000-7000-8000-000000000010',
  superAdminRole: '00000000-0000-7000-8000-000000000020',
  catalogManagerRole: '00000000-0000-7000-8000-000000000021',
  pricingManagerRole: '00000000-0000-7000-8000-000000000022',
  superAdminAssignment: '00000000-0000-7000-8000-000000000030',
} as const;

function permissionId(index: number): string {
  return `00000000-0000-7000-9000-${String(index + 1).padStart(12, '0')}`;
}

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

  await transaction.user.upsert({
    where: { id: ids.bootstrapUser },
    update: { displayName: 'Bootstrap Administrator', status: 'INVITED' },
    create: {
      id: ids.bootstrapUser,
      userType: 'STAFF',
      email: 'bootstrap-admin@example.invalid',
      normalizedEmail: 'bootstrap-admin@example.invalid',
      displayName: 'Bootstrap Administrator',
      status: 'INVITED',
    },
  });

  for (const [index, permission] of PERMISSION_CATALOG.entries()) {
    await transaction.permission.upsert({
      where: { code: permission.code },
      update: {
        module: permission.module,
        action: permission.action,
        isSensitive: permission.sensitive,
      },
      create: {
        id: permissionId(index),
        code: permission.code,
        module: permission.module,
        action: permission.action,
        isSensitive: permission.sensitive,
      },
    });
  }

  const roleSeeds = [
    {
      id: ids.superAdminRole,
      code: 'SUPER_ADMIN',
      name: 'Super Admin',
      permissionCodes: PERMISSION_CATALOG.map(({ code }) => code),
    },
    {
      id: ids.catalogManagerRole,
      code: 'CATALOG_MANAGER',
      name: 'Catalog Manager',
      permissionCodes: PERMISSION_CATALOG.filter(({ code }) =>
        code.startsWith('catalog.'),
      ).map(({ code }) => code),
    },
    {
      id: ids.pricingManagerRole,
      code: 'PRICING_MANAGER',
      name: 'Pricing Manager',
      permissionCodes: PERMISSION_CATALOG.filter(({ code }) =>
        code.startsWith('catalog.price.'),
      ).map(({ code }) => code),
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
    await transaction.rolePermission.createMany({
      data: permissions.map(({ id }) => ({ roleId: role.id, permissionId: id })),
      skipDuplicates: true,
    });
  }

  const superAdminRole = await transaction.role.findUniqueOrThrow({
    where: { code: 'SUPER_ADMIN' },
  });
  const assignment = await transaction.userRoleAssignment.findFirst({
    where: {
      userId: ids.bootstrapUser,
      roleId: superAdminRole.id,
      scopeType: 'GLOBAL',
      status: 'ACTIVE',
    },
  });
  if (!assignment) {
    await transaction.userRoleAssignment.create({
      data: {
        id: ids.superAdminAssignment,
        userId: ids.bootstrapUser,
        roleId: superAdminRole.id,
        scopeType: 'GLOBAL',
        assignedBy: ids.bootstrapUser,
      },
    });
  }
}

async function main(): Promise<void> {
  await prisma.$transaction(seed);
}

void main().finally(async () => prisma.$disconnect());
