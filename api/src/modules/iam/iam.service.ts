import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hash } from 'argon2';
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
  CreateStaffUserDto,
  LockStaffUserDto,
  RevokeRoleAssignmentDto,
  PermissionListDto,
  RoleListDto,
  UserDto,
  UserListDto,
  UserRoleAssignmentDto,
} from './iam.dto';
import { PERMISSION_CATALOG } from './iam.permissions';
import { IamRepository } from './iam.repository';
import { ScopeType, SystemRoleCode } from './iam.types';
import {
  IAM_SECURITY_DEFAULTS,
  ROLE_ASSIGNMENT_STATUS,
  ROLE_STATUS,
  USER_STATUS,
} from './iam.constants';

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
    const allowedRoleCodes: ReadonlySet<SystemRoleCode> | undefined = this.hasGlobalScope(actor)
      ? undefined
      : new Set<SystemRoleCode>([SystemRoleCode.STAFF]);
    return buildActiveLookupResponse(
      (await this.iam.listRoles())
        .filter((role) =>
          role.status === ROLE_STATUS.ACTIVE
          && (!allowedRoleCodes || allowedRoleCodes.has(role.code as SystemRoleCode)))
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
          status: ROLE_ASSIGNMENT_STATUS.ACTIVE,
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

  async revokeRoleAssignment(
    userId: string,
    assignmentId: string,
    input: RevokeRoleAssignmentDto,
    context: MutationContext,
    actor: AuthPrincipal,
  ): Promise<UserDto> {
    const user = await this.iam.findUser(userId);
    if (!user) throw new NotFoundException('Staff user not found');
    const assignment = user.assignments.find(({ id }) => id === assignmentId);
    if (!assignment) throw new NotFoundException('Active role assignment not found');
    if (assignment.roleCode === SystemRoleCode.OWNER) {
      throw new ForbiddenException('OWNER assignment cannot be revoked');
    }
    this.authorizeAssignment(actor, {
      roleCode: assignment.roleCode as SystemRoleCode,
      scopeType: assignment.scopeType,
      branchId: assignment.branchId,
    });
    const updated = await this.iam.revokeAssignmentAndIncrementPermissionVersion(
      assignmentId,
      userId,
      input.reason.trim(),
      context,
    );
    if (!updated) {
      throw new ConflictException('Role assignment changed; reload the user list and try again');
    }
    return updated;
  }

  async createStaffUser(
    input: CreateStaffUserDto,
    context: MutationContext,
    actor: AuthPrincipal,
  ): Promise<UserDto> {
    const assignmentInput: AssignUserRoleDto = {
      roleCode: input.roleCode,
      scopeType: ScopeType.BRANCH,
      branchId: input.branchId,
    };
    this.authorizeAssignment(actor, assignmentInput);
    await this.validateScope(assignmentInput);
    const role = await this.iam.findActiveRoleByCode(input.roleCode);
    if (!role) throw new NotFoundException('Role not found');

    const normalizedEmail = input.email.trim().toLowerCase();
    if (await this.iam.hasActiveEmail(normalizedEmail)) {
      throw new ConflictException('Staff email already exists');
    }
    try {
      return await this.iam.createStaffUser(
        {
          id: uuidv7(),
          displayName: input.displayName.trim(),
          email: normalizedEmail,
          normalizedEmail,
          passwordHash: await hash(IAM_SECURITY_DEFAULTS.INITIAL_STAFF_PASSWORD),
          role,
          branchId: input.branchId,
          assignmentId: uuidv7(),
        },
        context,
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Staff email already exists');
      }
      throw error;
    }
  }

  async lockStaffUser(
    userId: string,
    input: LockStaffUserDto,
    context: MutationContext,
    actor: AuthPrincipal,
  ): Promise<UserDto> {
    const user = await this.requireLifecycleTarget(userId, actor);
    if (user.status !== USER_STATUS.ACTIVE) {
      throw new ConflictException('Only an ACTIVE staff user can be locked');
    }
    const result = await this.iam.lockStaffUser(userId, input.reason.trim(), context);
    if (!result) {
      throw new ConflictException('Staff status changed; reload the user list and try again');
    }
    return result.user;
  }

  async unlockStaffUser(
    userId: string,
    context: MutationContext,
    actor: AuthPrincipal,
  ): Promise<UserDto> {
    const user = await this.requireLifecycleTarget(userId, actor);
    if (user.status !== USER_STATUS.LOCKED) {
      throw new ConflictException('Only a LOCKED staff user can be unlocked');
    }
    const passwordHash = await hash(IAM_SECURITY_DEFAULTS.INITIAL_STAFF_PASSWORD);
    const result = await this.iam.unlockStaffUserAndResetPassword(
      userId,
      passwordHash,
      context,
    );
    if (!result) {
      throw new ConflictException('Staff status changed; reload the user list and try again');
    }
    return result;
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

  private async requireLifecycleTarget(
    userId: string,
    actor: AuthPrincipal,
  ): Promise<UserDto> {
    const user = await this.iam.findUser(userId);
    if (!user) throw new NotFoundException('Staff user not found');
    if (user.assignments.some(({ roleCode }) => roleCode === SystemRoleCode.OWNER)) {
      throw new ForbiddenException('OWNER account cannot be locked or unlocked');
    }
    if (this.hasGlobalScope(actor)) return user;

    const branchIds = this.visibleBranchIds(actor) ?? [];
    const assignments = user.assignments;
    if (
      assignments.length === 0
      || assignments.some(({ roleCode }) => roleCode !== SystemRoleCode.STAFF)
      || assignments.some(({ branchId }) => !branchId || !branchIds.includes(branchId))
    ) {
      throw new ForbiddenException('Branch manager can manage STAFF only within an assigned branch');
    }
    return user;
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
