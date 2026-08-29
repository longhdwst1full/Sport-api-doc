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
  PermissionListDto,
  RoleDto,
  RoleListDto,
  UserListDto,
  UserRoleAssignmentDto,
} from './iam.dto';
import { PERMISSION_CATALOG } from './iam.permissions';
import { IamRepository } from './iam.repository';
import { ScopeType } from './iam.types';

@Injectable()
export class IamService {
  constructor(
    private readonly iam: IamRepository,
    private readonly organization: OrganizationService,
  ) {}

  listUsers(): UserListDto {
    const items = this.iam.listUsers();
    return { items, total: items.length };
  }

  listRoles(): RoleListDto {
    const items = this.iam.listRoles();
    return { items, total: items.length };
  }

  listPermissions(): PermissionListDto {
    const items = PERMISSION_CATALOG.map((permission) => ({ ...permission }));
    return { items, total: items.length };
  }

  createRole(input: CreateRoleDto): RoleDto {
    if (this.iam.hasRoleCode(input.code)) {
      throw new ConflictException('Role code already exists');
    }

    const knownCodes = new Set(PERMISSION_CATALOG.map((permission) => permission.code));
    const unknownCodes = input.permissionCodes.filter((code) => !knownCodes.has(code));
    if (unknownCodes.length) {
      throw new BadRequestException(`Unknown permission codes: ${unknownCodes.join(', ')}`);
    }

    return this.iam.saveRole({
      id: randomUUID(),
      code: input.code,
      name: input.name,
      description: input.description,
      status: 'ACTIVE',
      system: false,
      permissionCodes: [...input.permissionCodes],
      version: 0,
    });
  }

  assignRole(userId: string, input: AssignUserRoleDto): UserRoleAssignmentDto {
    if (!this.iam.hasUser(userId)) throw new NotFoundException('User not found');
    const role = this.iam.findActiveRoleByCode(input.roleCode);
    if (!role) throw new NotFoundException('Role not found');

    this.validateScope(input);
    if (
      this.iam.hasAssignment(userId, role.id, input.scopeType, input.branchId, input.warehouseId)
    ) {
      throw new ConflictException('Role assignment already exists');
    }

    return this.iam.saveAssignmentAndIncrementPermissionVersion({
      id: randomUUID(),
      userId,
      roleId: role.id,
      roleCode: role.code,
      scopeType: input.scopeType,
      branchId: input.branchId,
      warehouseId: input.warehouseId,
      status: 'ACTIVE',
      validFrom: new Date().toISOString(),
    });
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
      if (
        !input.branchId ||
        input.warehouseId ||
        !this.organization.hasActiveBranch(input.branchId)
      ) {
        throw new BadRequestException('BRANCH scope requires one active branchId only');
      }
      return;
    }

    if (
      !input.warehouseId ||
      input.branchId ||
      !this.organization.hasActiveWarehouse(input.warehouseId)
    ) {
      throw new BadRequestException('WAREHOUSE scope requires one active warehouseId only');
    }
  }
}
