import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { MutationContext } from '../../common/request/request-context';
import { AuthPrincipal } from '../auth/auth.types';
import { OrganizationService } from '../organization/organization.service';
import {
  ActiveLookupResponseDto,
  ActiveSearchQueryDto,
  buildActiveLookupResponse,
} from '../../common/pagination/active-search.dto';
import {
  AssignUserRoleDto,
  PermissionListDto,
  RoleListDto,
  UserListDto,
  UserRoleAssignmentDto,
} from './iam.dto';
import { PERMISSION_CATALOG } from './iam.permissions';
import { IamRepository } from './iam.repository';
import { ScopeType, SystemRoleCode } from './iam.types';

@Injectable()
export class IamService {
  constructor(
    private readonly iam: IamRepository,
    private readonly organization: OrganizationService,
  ) {}

  async listUsers(actor: AuthPrincipal): Promise<UserListDto> {
    const branchIds = this.visibleBranchIds(actor);
    const items = await this.iam.listUsers(branchIds);
    return { items, total: items.length };
  }

  async listRoles(): Promise<RoleListDto> {
    const items = await this.iam.listRoles();
    return { items, total: items.length };
  }

  listPermissions(): PermissionListDto {
    const items = PERMISSION_CATALOG.map((permission) => ({ ...permission }));
    return { items, total: items.length };
  }

  async searchActiveRoles(
    query: ActiveSearchQueryDto,
    actor: AuthPrincipal,
  ): Promise<ActiveLookupResponseDto> {
    const allowedRoleCodes = this.hasGlobalScope(actor)
      ? undefined
      : new Set([SystemRoleCode.STAFF]);
    return buildActiveLookupResponse(
      (await this.iam.listRoles())
        .filter((role) => role.status === 'ACTIVE' && (!allowedRoleCodes || allowedRoleCodes.has(role.code as SystemRoleCode)))
        .map((role) => ({ id: role.id, code: role.code, label: role.name })),
      query,
    );
  }

  async assignRole(
    userId: string,
    input: AssignUserRoleDto,
    context: MutationContext,
    actor: AuthPrincipal,
  ): Promise<UserRoleAssignmentDto> {
    this.authorizeAssignment(actor, input);
    if (!(await this.iam.hasUser(userId))) throw new NotFoundException('User not found');
    const role = await this.iam.findActiveRoleByCode(input.roleCode);
    if (!role) throw new NotFoundException('Role not found');

    await this.validateScope(input);
    if (
      await this.iam.hasAssignment(userId, role.id, input.scopeType, input.branchId)
    ) {
      throw new ConflictException('Role assignment already exists');
    }

    try {
      return await this.iam.saveAssignmentAndIncrementPermissionVersion(
        {
          id: uuidv7(),
          userId,
          roleId: role.id,
          roleCode: role.code,
          scopeType: input.scopeType,
          branchId: input.branchId,
          status: 'ACTIVE',
          validFrom: new Date().toISOString(),
        },
        context,
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Role assignment already exists');
      }
      throw error;
    }
  }

  private hasGlobalScope(actor: AuthPrincipal): boolean {
    return actor.scopes.some(({ type }) => type === ScopeType.GLOBAL);
  }

  private visibleBranchIds(actor: AuthPrincipal): string[] | undefined {
    if (this.hasGlobalScope(actor)) return undefined;
    const branchIds = [...new Set(actor.scopes.flatMap(({ type, branchId }) =>
      type === ScopeType.BRANCH && branchId ? [branchId] : [],
    ))];
    if (branchIds.length === 0) throw new ForbiddenException('No branch scope is assigned');
    return branchIds;
  }

  private authorizeAssignment(actor: AuthPrincipal, input: AssignUserRoleDto): void {
    if (this.hasGlobalScope(actor)) return;
    const branchIds = this.visibleBranchIds(actor) ?? [];
    if (
      input.roleCode !== SystemRoleCode.STAFF
      || input.scopeType !== ScopeType.BRANCH
      || !input.branchId
      || !branchIds.includes(input.branchId)
    ) {
      throw new ForbiddenException('Branch manager can assign STAFF only within an assigned branch');
    }
  }

  private async validateScope(input: AssignUserRoleDto): Promise<void> {
    if (input.roleCode === SystemRoleCode.OWNER && input.scopeType !== ScopeType.GLOBAL) {
      throw new BadRequestException('OWNER role requires GLOBAL scope');
    }
    if (input.roleCode !== SystemRoleCode.OWNER && input.scopeType !== ScopeType.BRANCH) {
      throw new BadRequestException(`${input.roleCode} role requires BRANCH scope`);
    }

    if (input.scopeType === ScopeType.GLOBAL) {
      if (input.branchId) {
        throw new BadRequestException('GLOBAL scope must not include branch');
      }
      return;
    }

    if (input.scopeType === ScopeType.BRANCH) {
      if (
        !input.branchId ||
        !(await this.organization.hasActiveBranch(input.branchId))
      ) {
        throw new BadRequestException('BRANCH scope requires one active branchId');
      }
      return;
    }
  }
}
