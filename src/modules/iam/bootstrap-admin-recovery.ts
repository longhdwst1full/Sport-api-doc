import { PrismaClient } from '@prisma/client';
import { hash } from 'argon2';
import { v7 as uuidv7 } from 'uuid';
import { BOOTSTRAP_ADMIN } from './bootstrap-admin.constants';
import {
  IAM_SECURITY_DEFAULTS,
  ROLE_ASSIGNMENT_STATUS,
  ROLE_STATUS,
  USER_STATUS,
  USER_TYPE,
} from './iam.constants';
import { ScopeType, SystemRoleCode } from './iam.types';

export interface BootstrapAdminResetResult {
  email: string;
  status: typeof USER_STATUS.ACTIVE;
  mustChangePassword: true;
  revokedSessionCount: number;
}

type PasswordHasher = (password: string) => Promise<string>;

export async function resetBootstrapAdmin(
  prisma: PrismaClient,
  passwordHasher: PasswordHasher = hash,
): Promise<BootstrapAdminResetResult> {
  // Hash outside the database transaction so the user row is locked for the
  // shortest possible time when this break-glass command is executed.
  const passwordHash = await passwordHasher(IAM_SECURITY_DEFAULTS.INITIAL_STAFF_PASSWORD);
  const requestId = `bootstrap-reset-${uuidv7()}`;

  return prisma.$transaction(async (transaction) => {
    const user = await transaction.user.findFirst({
      where: { normalizedEmail: BOOTSTRAP_ADMIN.EMAIL },
      include: {
        roleAssignments: {
          where: {
            status: ROLE_ASSIGNMENT_STATUS.ACTIVE,
            scopeType: ScopeType.GLOBAL,
          },
          include: { role: true },
        },
      },
    });
    if (!user) {
      throw new Error('Bootstrap administrator was not found. Run yarn db:seed first.');
    }
    if (
      user.userType !== USER_TYPE.STAFF
      || user.normalizedEmail !== BOOTSTRAP_ADMIN.EMAIL
      || !user.roleAssignments.some(
        ({ role }) => role.code === SystemRoleCode.OWNER && role.status === ROLE_STATUS.ACTIVE,
      )
    ) {
      throw new Error('Bootstrap administrator identity or OWNER assignment is invalid.');
    }

    const before = {
      status: user.status,
      failedLoginAttempts: user.failedLoginAttempts,
      mustChangePassword: user.mustChangePassword,
    };
    await transaction.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        status: USER_STATUS.ACTIVE,
        failedLoginAttempts: 0,
        mustChangePassword: true,
        lockedAt: null,
        lockReason: null,
        permissionVersion: { increment: 1 },
        version: { increment: 1 },
      },
    });
    const revokedSessions = await transaction.authSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: {
        revokedAt: new Date(),
        revokeReason: BOOTSTRAP_ADMIN.RESET_REASON,
      },
    });
    await transaction.auditLog.create({
      data: {
        requestId,
        sequenceNo: 1,
        actorType: 'SYSTEM',
        action: BOOTSTRAP_ADMIN.AUDIT_ACTION,
        entityType: 'USER',
        entityId: user.id.toString(),
        beforeJson: before,
        afterJson: {
          status: USER_STATUS.ACTIVE,
          failedLoginAttempts: 0,
          mustChangePassword: true,
          revokedSessionCount: revokedSessions.count,
        },
        reason: BOOTSTRAP_ADMIN.RESET_REASON,
      },
    });

    return {
      email: BOOTSTRAP_ADMIN.EMAIL,
      status: USER_STATUS.ACTIVE,
      mustChangePassword: true,
      revokedSessionCount: revokedSessions.count,
    };
  });
}
