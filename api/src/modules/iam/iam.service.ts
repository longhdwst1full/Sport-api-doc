import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationService } from '../organization/organization.service';
import {
  AssignUserRoleDto,
  CreateRoleDto,
  PermissionDto,
  PermissionListDto,
  RoleDto,
  RoleListDto,
  ScopeType,
  UserDto,
  UserListDto,
  UserRoleAssignmentDto,
} from './iam.dto';

const PERMISSIONS: PermissionDto[] = [
  { code: 'org.branch.view', module: 'Organization', action: 'view', sensitive: false },
  { code: 'org.branch.manage', module: 'Organization', action: 'manage', sensitive: true },
  { code: 'org.warehouse.view', module: 'Organization', action: 'view', sensitive: false },
  { code: 'org.warehouse.manage', module: 'Organization', action: 'manage', sensitive: true },
  { code: 'iam.user.view', module: 'IAM', action: 'view', sensitive: true },
  { code: 'iam.user.manage', module: 'IAM', action: 'manage', sensitive: true },
  { code: 'iam.role.view', module: 'IAM', action: 'view', sensitive: false },
  { code: 'iam.role.manage', module: 'IAM', action: 'manage', sensitive: true },
  { code: 'iam.assignment.manage', module: 'IAM', action: 'manage', sensitive: true },
  { code: 'iam.audit.view', module: 'IAM', action: 'view', sensitive: true },
];

@Injectable()
export class IamService {
  private readonly superAdminRoleId = randomUUID();
  private readonly branchManagerRoleId = randomUUID();
  private readonly superAdminUserId = randomUUID();

  private readonly roles: RoleDto[] = [
    {
      id: this.superAdminRoleId,
      code: 'SUPER_ADMIN',
      name: 'Super Admin',
      description: 'Quản trị toàn bộ hệ thống',
      status: 'ACTIVE',
      system: true,
      permissionCodes: PERMISSIONS.map((permission) => permission.code),
      version: 0,
    },
    {
      id: this.branchManagerRoleId,
      code: 'BRANCH_MANAGER',
      name: 'Branch Manager',
      description: 'Quản lý vận hành theo chi nhánh',
      status: 'ACTIVE',
      system: true,
      permissionCodes: ['org.branch.view', 'org.warehouse.view'],
      version: 0,
    },
  ];

  private readonly assignments: UserRoleAssignmentDto[] = [
    {
      id: randomUUID(),
      userId: this.superAdminUserId,
      roleId: this.superAdminRoleId,
      roleCode: 'SUPER_ADMIN',
      scopeType: ScopeType.GLOBAL,
      status: 'ACTIVE',
      validFrom: new Date().toISOString(),
    },
  ];

  private readonly users: Array<Omit<UserDto, 'assignments'>> = [
    {
      id: this.superAdminUserId,
      displayName: 'Long Hoàng',
      maskedEmail: 'lo***@dctd.vn',
      userType: 'STAFF',
      status: 'ACTIVE',
      permissionVersion: 1,
    },
    {
      id: randomUUID(),
      displayName: 'Nguyễn Hoàng Nam',
      maskedEmail: 'na***@dctd.vn',
      userType: 'STAFF',
      status: 'ACTIVE',
      permissionVersion: 0,
    },
  ];

  constructor(private readonly organization: OrganizationService) {}

  listUsers(): UserListDto {
    const items = this.users.map((user) => ({
      ...user,
      assignments: this.assignments.filter((assignment) => assignment.userId === user.id),
    }));
    return { items, total: items.length };
  }

  listRoles(): RoleListDto {
    return { items: this.roles.map((role) => ({ ...role })), total: this.roles.length };
  }

  listPermissions(): PermissionListDto {
    return {
      items: PERMISSIONS.map((permission) => ({ ...permission })),
      total: PERMISSIONS.length,
    };
  }

  createRole(input: CreateRoleDto): RoleDto {
    if (this.roles.some((role) => role.code === input.code)) {
      throw new ConflictException('Role code already exists');
    }
    const knownCodes = new Set(PERMISSIONS.map((permission) => permission.code));
    const unknownCodes = input.permissionCodes.filter((code) => !knownCodes.has(code));
    if (unknownCodes.length) {
      throw new BadRequestException(`Unknown permission codes: ${unknownCodes.join(', ')}`);
    }

    const role: RoleDto = {
      id: randomUUID(),
      code: input.code,
      name: input.name,
      description: input.description,
      status: 'ACTIVE',
      system: false,
      permissionCodes: [...input.permissionCodes],
      version: 0,
    };
    this.roles.push(role);
    return { ...role };
  }

  assignRole(userId: string, input: AssignUserRoleDto): UserRoleAssignmentDto {
    const user = this.users.find((candidate) => candidate.id === userId);
    if (!user) throw new NotFoundException('User not found');
    const role = this.roles.find(
      (candidate) => candidate.code === input.roleCode && candidate.status === 'ACTIVE',
    );
    if (!role) throw new NotFoundException('Role not found');

    this.validateScope(input);
    const duplicate = this.assignments.some(
      (assignment) =>
        assignment.userId === userId &&
        assignment.roleId === role.id &&
        assignment.scopeType === input.scopeType &&
        assignment.branchId === input.branchId &&
        assignment.warehouseId === input.warehouseId,
    );
    if (duplicate) throw new ConflictException('Role assignment already exists');

    const assignment: UserRoleAssignmentDto = {
      id: randomUUID(),
      userId,
      roleId: role.id,
      roleCode: role.code,
      scopeType: input.scopeType,
      branchId: input.branchId,
      warehouseId: input.warehouseId,
      status: 'ACTIVE',
      validFrom: new Date().toISOString(),
    };
    this.assignments.push(assignment);
    user.permissionVersion += 1;
    return { ...assignment };
  }

  private validateScope(input: AssignUserRoleDto): void {
    if (input.scopeType === ScopeType.GLOBAL || input.scopeType === ScopeType.OWN) {
      if (input.branchId || input.warehouseId) {
        throw new BadRequestException(
          `${input.scopeType} scope must not include branch or warehouse`,
        );
      }
      return;
    }
    if (input.scopeType === ScopeType.BRANCH) {
      if (!input.branchId || input.warehouseId || !this.organization.hasBranch(input.branchId)) {
        throw new BadRequestException('BRANCH scope requires one active branchId only');
      }
      return;
    }
    if (
      !input.warehouseId ||
      input.branchId ||
      !this.organization.hasWarehouse(input.warehouseId)
    ) {
      throw new BadRequestException('WAREHOUSE scope requires one active warehouseId only');
    }
  }
}
