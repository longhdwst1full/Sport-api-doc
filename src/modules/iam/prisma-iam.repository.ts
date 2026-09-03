import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MutationContext } from '../../common/request/request-context';
import { PrismaService } from '../../database/prisma.service';
import { AuditWriter } from '../audit/audit.writer';
import {
  ROLE_ASSIGNMENT_STATUS,
  IAM_AUDIT_ACTION,
  ROLE_STATUS,
  USER_STATUS,
  USER_TYPE,
} from './iam.constants';
import { IamRepository } from './iam.repository';
import {
  CreateStaffUserInput,
  LockStaffUserResult,
  Role,
  ScopeType,
  UserRoleAssignment,
  UserWithAssignments,
} from './iam.types';

function maskEmail(email: string | null): string {
  if (!email) return '';
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 2)}***@${domain}`;
}

@Injectable()
export class PrismaIamRepository extends IamRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
  ) {
    super();
  }

  async listUsers(branchIds?: string[]): Promise<UserWithAssignments[]> {
    const rows = await this.prisma.user.findMany({
      where: {
        userType: USER_TYPE.STAFF,
        ...(branchIds
          ? {
              roleAssignments: {
                some: { status: ROLE_ASSIGNMENT_STATUS.ACTIVE, branchId: { in: branchIds } },
              },
            }
          : {}),
      },
      include: {
        roleAssignments: {
          where: { status: ROLE_ASSIGNMENT_STATUS.ACTIVE },
          include: { role: true },
          orderBy: { validFrom: 'asc' },
        },
      },
      orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      displayName: row.displayName,
      maskedEmail: maskEmail(row.email),
      userType: row.userType as UserWithAssignments['userType'],
      status: row.status as UserWithAssignments['status'],
      permissionVersion: Number(row.permissionVersion),
      assignments: row.roleAssignments.map((assignment) => ({
        id: assignment.id,
        userId: assignment.userId,
        roleId: assignment.roleId,
        roleCode: assignment.role.code,
        scopeType: assignment.scopeType as ScopeType,
        ...(assignment.branchId ? { branchId: assignment.branchId } : {}),
        status: ROLE_ASSIGNMENT_STATUS.ACTIVE,
        validFrom: assignment.validFrom.toISOString(),
      })),
    }));
  }

  async findUser(id: string): Promise<UserWithAssignments | undefined> {
    return (await this.listUsers()).find((user) => user.id === id);
  }

  async listRoles(): Promise<Role[]> {
    const rows = await this.prisma.role.findMany({
      where: { status: ROLE_STATUS.ACTIVE },
      include: { permissions: { include: { permission: true } } },
      orderBy: { code: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      ...(row.description ? { description: row.description } : {}),
      status: row.status as Role['status'],
      system: row.isSystem,
      permissionCodes: row.permissions.map(({ permission }) => permission.code).sort(),
      version: Number(row.version),
    }));
  }

  async findActiveRoleByCode(code: string): Promise<Role | undefined> {
    return (await this.listRoles()).find((role) => role.code === code);
  }

  async hasUser(id: string): Promise<boolean> {
    return (
      (await this.prisma.user.count({
        where: {
          id,
          userType: USER_TYPE.STAFF,
          status: { not: USER_STATUS.INACTIVE },
        },
      })) > 0
    );
  }

  async hasActiveEmail(normalizedEmail: string): Promise<boolean> {
    return (
      (await this.prisma.user.count({
        where: { normalizedEmail, status: { not: USER_STATUS.INACTIVE } },
      })) > 0
    );
  }

  async hasAssignment(
    userId: string,
    roleId: string,
    scopeType: ScopeType,
    branchId?: string,
  ): Promise<boolean> {
    return (
      (await this.prisma.userRoleAssignment.count({
        where: {
          userId,
          roleId,
          scopeType,
          branchId: branchId ?? null,
          status: ROLE_ASSIGNMENT_STATUS.ACTIVE,
        },
      })) > 0
    );
  }

  async saveAssignmentAndIncrementPermissionVersion(
    assignment: UserRoleAssignment,
    context: MutationContext,
  ): Promise<UserRoleAssignment> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.userRoleAssignment.create({
        data: {
          id: assignment.id,
          userId: assignment.userId,
          roleId: assignment.roleId,
          scopeType: assignment.scopeType,
          branchId: assignment.branchId,
          status: assignment.status,
          validFrom: new Date(assignment.validFrom),
          assignedBy: context.actorUserId,
        },
      });
      await transaction.user.update({
        where: { id: assignment.userId },
        data: { permissionVersion: { increment: 1 } },
      });
      await this.audit.write(
        {
          requestId: context.requestId,
          sequenceNo: 1,
          actorType: 'USER',
          actorUserId: context.actorUserId,
          action: IAM_AUDIT_ACTION.ASSIGNMENT_CREATE,
          entityType: 'USER_ROLE_ASSIGNMENT',
          entityId: assignment.id,
          after: assignment as unknown as Prisma.InputJsonValue,
        },
        transaction,
      );
      return assignment;
    });
  }

  async revokeAssignmentAndIncrementPermissionVersion(
    assignmentId: string,
    userId: string,
    reason: string,
    context: MutationContext,
  ): Promise<UserWithAssignments | undefined> {
    const revoked = await this.prisma.$transaction(async (transaction) => {
      const now = new Date();
      const updated = await transaction.userRoleAssignment.updateMany({
        where: {
          id: assignmentId,
          userId,
          status: ROLE_ASSIGNMENT_STATUS.ACTIVE,
          validTo: null,
        },
        data: {
          status: ROLE_ASSIGNMENT_STATUS.REVOKED,
          validTo: now,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) return false;
      await transaction.user.update({
        where: { id: userId },
        data: { permissionVersion: { increment: 1 } },
      });
      await this.audit.write(
        {
          requestId: context.requestId,
          sequenceNo: 1,
          actorType: 'USER',
          actorUserId: context.actorUserId,
          action: IAM_AUDIT_ACTION.ASSIGNMENT_REVOKE,
          entityType: 'USER_ROLE_ASSIGNMENT',
          entityId: assignmentId,
          before: { status: ROLE_ASSIGNMENT_STATUS.ACTIVE },
          after: {
            status: ROLE_ASSIGNMENT_STATUS.REVOKED,
            validTo: now.toISOString(),
          },
          reason,
        },
        transaction,
      );
      return true;
    });
    if (!revoked) return undefined;
    return this.findUser(userId);
  }

  async createStaffUser(
    input: CreateStaffUserInput,
    context: MutationContext,
  ): Promise<UserWithAssignments> {
    return this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.create({
        data: {
          id: input.id,
          userType: USER_TYPE.STAFF,
          email: input.email,
          normalizedEmail: input.normalizedEmail,
          passwordHash: input.passwordHash,
          displayName: input.displayName,
          status: USER_STATUS.ACTIVE,
          permissionVersion: 1,
        },
      });
      const assignment = await transaction.userRoleAssignment.create({
        data: {
          id: input.assignmentId,
          userId: input.id,
          roleId: input.role.id,
          scopeType: ScopeType.BRANCH,
          branchId: input.branchId,
          status: ROLE_ASSIGNMENT_STATUS.ACTIVE,
          validFrom: new Date(),
          assignedBy: context.actorUserId,
        },
      });
      const result: UserWithAssignments = {
        id: user.id,
        displayName: user.displayName,
        maskedEmail: maskEmail(user.email),
        userType: USER_TYPE.STAFF,
        status: USER_STATUS.ACTIVE,
        permissionVersion: 1,
        assignments: [{
          id: assignment.id,
          userId: user.id,
          roleId: input.role.id,
          roleCode: input.role.code,
          scopeType: ScopeType.BRANCH,
          branchId: input.branchId,
          status: ROLE_ASSIGNMENT_STATUS.ACTIVE,
          validFrom: assignment.validFrom.toISOString(),
        }],
      };
      await this.audit.write(
        {
          requestId: context.requestId,
          sequenceNo: 1,
          actorType: 'USER',
          actorUserId: context.actorUserId,
          action: IAM_AUDIT_ACTION.USER_CREATE,
          entityType: 'USER',
          entityId: user.id,
          after: {
            displayName: result.displayName,
            maskedEmail: result.maskedEmail,
            roleCode: input.role.code,
            branchId: input.branchId,
          },
        },
        transaction,
      );
      return result;
    });
  }

  async lockStaffUser(
    userId: string,
    reason: string,
    context: MutationContext,
  ): Promise<LockStaffUserResult | undefined> {
    const revokedSessionCount = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.user.updateMany({
        where: {
          id: userId,
          userType: USER_TYPE.STAFF,
          status: USER_STATUS.ACTIVE,
        },
        data: {
          status: USER_STATUS.LOCKED,
          permissionVersion: { increment: 1 },
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) return undefined;

      const revoked = await transaction.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: 'ACCOUNT_LOCKED' },
      });
      await this.audit.write(
        {
          requestId: context.requestId,
          sequenceNo: 1,
          actorType: 'USER',
          actorUserId: context.actorUserId,
          action: IAM_AUDIT_ACTION.USER_LOCK,
          entityType: 'USER',
          entityId: userId,
          before: { status: USER_STATUS.ACTIVE },
          after: {
            status: USER_STATUS.LOCKED,
            revokedSessionCount: revoked.count,
          },
          reason,
        },
        transaction,
      );
      return revoked.count;
    });
    if (revokedSessionCount === undefined) return undefined;
    const user = await this.findUser(userId);
    if (!user) throw new Error('Locked staff user disappeared after transaction commit');
    return { user, revokedSessionCount };
  }

  async unlockStaffUserAndResetPassword(
    userId: string,
    passwordHash: string,
    context: MutationContext,
  ): Promise<UserWithAssignments | undefined> {
    const unlocked = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.user.updateMany({
        where: {
          id: userId,
          userType: USER_TYPE.STAFF,
          status: USER_STATUS.LOCKED,
        },
        data: {
          status: USER_STATUS.ACTIVE,
          passwordHash,
          permissionVersion: { increment: 1 },
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) return false;

      await this.audit.write(
        {
          requestId: context.requestId,
          sequenceNo: 1,
          actorType: 'USER',
          actorUserId: context.actorUserId,
          action: IAM_AUDIT_ACTION.USER_UNLOCK,
          entityType: 'USER',
          entityId: userId,
          before: { status: USER_STATUS.LOCKED },
          after: { status: USER_STATUS.ACTIVE, passwordReset: true },
        },
        transaction,
      );
      return true;
    });
    if (!unlocked) return undefined;
    const user = await this.findUser(userId);
    if (!user) throw new Error('Unlocked staff user disappeared after transaction commit');
    return user;
  }
}
