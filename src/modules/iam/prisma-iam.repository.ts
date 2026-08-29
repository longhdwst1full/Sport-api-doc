import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MutationContext } from '../../common/request/request-context';
import { PrismaService } from '../../database/prisma.service';
import { AuditWriter } from '../audit/audit.writer';
import { IamRepository } from './iam.repository';
import { Role, ScopeType, UserRoleAssignment, UserWithAssignments } from './iam.types';

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
        userType: 'STAFF',
        deletedAt: null,
        ...(branchIds
          ? { roleAssignments: { some: { status: 'ACTIVE', branchId: { in: branchIds } } } }
          : {}),
      },
      include: {
        roleAssignments: {
          where: { status: 'ACTIVE' },
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
        status: 'ACTIVE',
        validFrom: assignment.validFrom.toISOString(),
      })),
    }));
  }

  async listRoles(): Promise<Role[]> {
    const rows = await this.prisma.role.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
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
        where: { id, userType: 'STAFF', deletedAt: null, status: { not: 'INACTIVE' } },
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
          status: 'ACTIVE',
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
          action: 'iam.assignment.create',
          entityType: 'USER_ROLE_ASSIGNMENT',
          entityId: assignment.id,
          after: assignment as unknown as Prisma.InputJsonValue,
        },
        transaction,
      );
      return assignment;
    });
  }
}
