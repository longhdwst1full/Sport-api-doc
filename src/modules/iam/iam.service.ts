import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hash } from 'argon2';
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
  CreateRoleDto,
  CreateStaffUserDto,
  DeleteRoleDto,
  LockStaffUserDto,
  RevokeRoleAssignmentDto,
  PermissionListDto,
  RoleDto,
  RoleListDto,
  UpdateRoleDto,
  UserDto,
  UserListDto,
  UserRoleAssignmentDto,
} from './iam.dto';
import { PERMISSION_CATALOG, V1_ROLE_PERMISSIONS } from './iam.permissions';
import { IamRepository } from './iam.repository';
import {
  ASSIGNABLE_STAFF_ROLE_CODES,
  AssignableStaffRoleCode,
  ScopeType,
  SystemRoleCode,
} from './iam.types';
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

  async listAllRoles(): Promise<RoleListDto> {
    const items = await this.iam.listAllRoles();
    return { items, total: items.length };
  }

  async getRole(roleId: string): Promise<RoleDto> {
    const role = await this.iam.findRole(roleId);
    if (!role) throw new NotFoundException('Không tìm thấy vai trò');
    return role;
  }

  async createRole(
    input: CreateRoleDto,
    context: MutationContext,
    actor: AuthPrincipal,
  ): Promise<RoleDto> {
    this.authorizeRoleAdministration(actor);
    const code = input.code.trim().toUpperCase();
    if ((Object.values(SystemRoleCode) as string[]).includes(code)) {
      throw new ConflictException('Mã vai trò này thuộc hệ thống, hãy chọn mã khác');
    }
    const permissionCodes = await this.resolvePermissionCodes(input.permissionCodes, actor);
    if (await this.iam.hasRoleCode(code)) {
      throw new ConflictException('Mã vai trò đã tồn tại');
    }
    try {
      return await this.iam.createRole(
        {
          code,
          name: input.name.trim(),
          ...(input.description?.trim() ? { description: input.description.trim() } : {}),
          permissionCodes,
        },
        context,
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Mã vai trò đã tồn tại');
      }
      throw error;
    }
  }

  async updateRole(
    roleId: string,
    input: UpdateRoleDto,
    context: MutationContext,
    actor: AuthPrincipal,
  ): Promise<RoleDto> {
    this.authorizeRoleAdministration(actor);
    const role = await this.iam.findRole(roleId);
    if (!role) throw new NotFoundException('Không tìm thấy vai trò');
    if (
      role.code === SystemRoleCode.OWNER
      && input.status !== undefined
      && input.status !== role.status
    ) {
      throw new ForbiddenException('Vai trò OWNER phải luôn hoạt động để tránh khóa toàn hệ thống');
    }
    if (
      role.code === SystemRoleCode.OWNER
      && input.permissionCodes
      && !this.hasExactlyAllOwnerPermissions(input.permissionCodes)
    ) {
      throw new ForbiddenException(
        'Vai trò OWNER phải giữ toàn bộ quyền hệ thống để tránh mất quyền quản trị',
      );
    }
    const permissionCodes = input.permissionCodes
      ? role.code === SystemRoleCode.OWNER
        ? [...V1_ROLE_PERMISSIONS.OWNER]
        : await this.resolvePermissionCodes(input.permissionCodes, actor, role.permissionCodes)
      : undefined;
    const updated = await this.iam.updateRole(
      roleId,
      {
        ...(input.name === undefined ? {} : { name: input.name.trim() }),
        ...(input.description === undefined ? {} : { description: input.description.trim() }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(permissionCodes ? { permissionCodes } : {}),
        expectedVersion: input.expectedVersion,
      },
      context,
    );
    if (!updated) {
      throw new ConflictException('Vai trò vừa được người khác sửa; hãy tải lại và thử lại');
    }
    return updated;
  }

  /** SECURITY: OWNER là tài khoản break-glass duy nhất nên tập quyền không được phép bị thu hẹp. */
  private hasExactlyAllOwnerPermissions(permissionCodes: readonly string[]): boolean {
    const requested = new Set(permissionCodes);
    return requested.size === V1_ROLE_PERMISSIONS.OWNER.length
      && V1_ROLE_PERMISSIONS.OWNER.every((permissionCode) => requested.has(permissionCode));
  }

  async deleteRole(
    roleId: string,
    expectedVersion: number,
    input: DeleteRoleDto,
    context: MutationContext,
    actor: AuthPrincipal,
  ): Promise<void> {
    this.authorizeRoleAdministration(actor);
    const role = await this.iam.findRole(roleId);
    if (!role) throw new NotFoundException('Không tìm thấy vai trò');
    if (role.code === SystemRoleCode.OWNER) {
      throw new ForbiddenException('Không được xoá hoặc ngừng vai trò OWNER');
    }
    if (role.system) {
      if (role.status === ROLE_STATUS.INACTIVE) {
        throw new ConflictException('Vai trò hệ thống này đã ngừng hoạt động');
      }
      // Vai trò hệ thống có mã được code tham chiếu nên DELETE chỉ đổi lifecycle.
      // Repository đồng thời tăng permissionVersion để phiên đang giữ role mất quyền ngay.
      const deactivated = await this.iam.updateRole(
        roleId,
        {
          status: ROLE_STATUS.INACTIVE,
          reason: input.reason.trim(),
          expectedVersion,
        },
        context,
      );
      if (!deactivated) {
        throw new ConflictException('Vai trò vừa thay đổi; hãy tải lại danh sách và thử lại');
      }
      return;
    }
    if ((await this.iam.countRoleAssignments(roleId)) > 0) {
      throw new ConflictException(
        'Vai trò đang được gán cho người dùng; hãy gỡ hết phân quyền trước khi xoá',
      );
    }
    const deleted = await this.iam.deleteRole(
      roleId,
      input.reason.trim(),
      expectedVersion,
      context,
    );
    if (!deleted) {
      throw new ConflictException('Vai trò vừa thay đổi; hãy tải lại danh sách và thử lại');
    }
  }

  /**
   * Không cho leo thang đặc quyền: người sửa chỉ cấp được quyền chính họ đang có.
   * Quyền đã tồn tại sẵn trên vai trò được giữ lại để không buộc phải có toàn quyền mới sửa được tên.
   */
  private async resolvePermissionCodes(
    requested: string[],
    actor: AuthPrincipal,
    currentCodes: readonly string[] = [],
  ): Promise<string[]> {
    const codes = [...new Set(requested.map((code) => code.trim()))].sort();
    const missing = await this.iam.listMissingPermissionCodes(codes);
    if (missing.length > 0) {
      throw new BadRequestException(`Quyền không tồn tại: ${missing.join(', ')}`);
    }
    const held = new Set([...actor.permissions, ...currentCodes]);
    const escalated = codes.filter((code) => !held.has(code));
    if (escalated.length > 0) {
      throw new ForbiddenException(
        `Bạn không thể cấp quyền mà chính mình không có: ${escalated.join(', ')}`,
      );
    }
    return codes;
  }

  private authorizeRoleAdministration(actor: AuthPrincipal): void {
    if (!this.hasGlobalScope(actor)) {
      throw new ForbiddenException('Chỉ quản trị viên phạm vi toàn hệ thống mới quản lý vai trò');
    }
  }

  listPermissions(): PermissionListDto {
    const items = PERMISSION_CATALOG.map((permission) => ({ ...permission }));
    return { items, total: items.length };
  }

  async searchActiveRoles(
    query: ActiveSearchQueryDto,
    actor: AuthPrincipal,
  ): Promise<ActiveLookupResponseDto> {
    const allowedRoleCodes: ReadonlySet<AssignableStaffRoleCode> = this.hasGlobalScope(actor)
      ? new Set(ASSIGNABLE_STAFF_ROLE_CODES)
      : new Set<AssignableStaffRoleCode>([SystemRoleCode.STAFF]);
    return buildActiveLookupResponse(
      (await this.iam.listRoles())
        .filter((role) =>
          role.status === ROLE_STATUS.ACTIVE
          && allowedRoleCodes.has(role.code as AssignableStaffRoleCode))
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
    if (!(await this.iam.hasUser(userId))) throw new NotFoundException('Không tìm thấy tài khoản');
    const role = await this.iam.findActiveRoleByCode(input.roleCode);
    if (!role) throw new NotFoundException('Không tìm thấy vai trò');
    this.assertCanGrantRole(actor, role);

    await this.validateScope(input);
    if (
      await this.iam.hasAssignment(userId, role.id, input.scopeType, input.branchId)
    ) {
      throw new ConflictException('Role assignment already exists');
    }

    try {
      return await this.iam.saveAssignmentAndIncrementPermissionVersion(
        {
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
    if (
      !ASSIGNABLE_STAFF_ROLE_CODES.includes(assignment.roleCode as AssignableStaffRoleCode)
      || assignment.scopeType !== ScopeType.BRANCH
      || !assignment.branchId
    ) {
      throw new ForbiddenException('Only subordinate branch assignments can be revoked');
    }
    this.authorizeAssignment(actor, {
      roleCode: assignment.roleCode as AssignableStaffRoleCode,
      scopeType: ScopeType.BRANCH,
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
    if (!role) throw new NotFoundException('Không tìm thấy vai trò');
    this.assertCanGrantRole(actor, role);

    const normalizedEmail = input.email.trim().toLowerCase();
    if (await this.iam.hasActiveEmail(normalizedEmail)) {
      throw new ConflictException('Staff email already exists');
    }
    try {
      return await this.iam.createStaffUser(
        {
          displayName: input.displayName.trim(),
          email: normalizedEmail,
          normalizedEmail,
          passwordHash: await hash(IAM_SECURITY_DEFAULTS.INITIAL_STAFF_PASSWORD),
          role,
          branchId: input.branchId,
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
    if (!ASSIGNABLE_STAFF_ROLE_CODES.includes(input.roleCode)) {
      throw new ForbiddenException('OWNER is the single bootstrap administrator and cannot be assigned');
    }
    if (!this.hasGlobalScope(actor)) {
      throw new ForbiddenException('Only the root administrator can assign staff roles');
    }
  }

  /**
   * Không cho leo thang đặc quyền qua đường GÁN vai trò.
   *
   * SECURITY: `resolvePermissionCodes` chặn việc SỬA vai trò để thêm quyền mình không có, nhưng
   * gán vai trò là cánh cửa thứ hai vào cùng chỗ đó: một tài khoản chỉ có `iam.assignment.manage`
   * và phạm vi GLOBAL trước đây gán được BRANCH_MANAGER (32 quyền) cho bất kỳ nhân viên nào —
   * kể cả chính mình — và nhận đủ 32 quyền đó ở lần làm mới phiên kế tiếp.
   *
   * Quy tắc đặt giống hệt bên sửa vai trò để hai đường không lệch nhau: chỉ gán được vai trò có
   * tập quyền nằm trong tập quyền của chính người gán. Quản trị viên gốc giữ toàn bộ quyền nên
   * không bị ảnh hưởng.
   */
  private assertCanGrantRole(
    actor: AuthPrincipal,
    role: { code: string; permissionCodes: readonly string[] },
  ): void {
    const held = new Set(actor.permissions);
    const escalated = role.permissionCodes.filter((code) => !held.has(code));
    if (escalated.length > 0) {
      throw new ForbiddenException(
        `Bạn không thể gán vai trò ${role.code} vì nó chứa quyền bạn không có: ${escalated.join(', ')}`,
      );
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
    if (!this.hasGlobalScope(actor)) {
      throw new ForbiddenException('Only the root administrator can manage staff accounts');
    }
    return user;
  }

  private async validateScope(input: AssignUserRoleDto): Promise<void> {
    if (input.scopeType !== ScopeType.BRANCH) {
      throw new BadRequestException(`${input.roleCode} role requires BRANCH scope`);
    }
    if (!(await this.organization.hasActiveBranch(input.branchId))) {
      throw new BadRequestException('BRANCH scope requires one active branchId');
    }
  }
}
