import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, User } from '@prisma/client';
import { hash, verify } from 'argon2';
import { v7 as uuidv7 } from 'uuid';
import { toDatabaseId, toEntityId } from '../../common/identifiers/entity-id';
import { PrismaService } from '../../database/prisma.service';
import { AuditWriter } from '../audit/audit.writer';
import { OutboxWriter } from '../notification/outbox.writer';
import { OUTBOX_EVENT_TYPE } from '../notification/notification.constants';
import { VIETNAM_TIME_ZONE } from '../../common/time/vietnam-time';
import {
  ROLE_ASSIGNMENT_STATUS,
  ROLE_STATUS,
  USER_STATUS,
  USER_TYPE,
} from '../iam/iam.constants';
import { ScopeType } from '../iam/iam.types';
import { AUTH_AUDIT_ACTION, AUTH_ERROR, AUTH_SECURITY } from './auth.constants';
import { ChangePasswordDto, LoginDto, RegisterCustomerDto, TokenPairDto } from './auth.dto';
import { AccessTokenPayload, AuthPrincipal, AuthScope } from './auth.types';
import {
  InvalidVietnamesePhoneNumberError,
  normalizeVietnamesePhone,
} from './phone-normalization';

type LoginUserType = typeof USER_TYPE.CUSTOMER | typeof USER_TYPE.STAFF;

interface CachedGrants {
  value: { permissions: string[]; scopes: AuthScope[] };
  expiresAt: number;
}

/** Short enough that a revoked role assignment without a version bump cannot linger. */
const AUTH_GRANT_CACHE_TTL_MS = 60_000;
/** Bounds memory on a long-lived process; a full clear is acceptable because entries are cheap to rebuild. */
const AUTH_GRANT_CACHE_MAX_ENTRIES = 5_000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
  ) {}

  private readonly grantCache = new Map<string, CachedGrants>();

  async login(
    input: LoginDto,
    userType: LoginUserType = USER_TYPE.STAFF,
    requestId = `login-${uuidv7()}`,
  ): Promise<TokenPairDto> {
    this.ensureDatabaseEnabled();
    const identity = this.normalizeLoginIdentifier(input.identifier);
    const password = input.password.trim();
    const user = await this.prisma.user.findFirst({
      where: {
        userType,
        ...(identity.type === 'EMAIL'
          ? { normalizedEmail: identity.value }
          : { normalizedPhone: identity.value }),
      },
    });
    if (!user?.passwordHash) {
      throw new UnauthorizedException(AUTH_ERROR.INVALID_CREDENTIALS);
    }
    if (user.status === USER_STATUS.LOCKED) {
      throw new UnauthorizedException(AUTH_ERROR.ACCOUNT_LOCKED);
    }
    if (user.status !== USER_STATUS.ACTIVE) {
      throw new UnauthorizedException(AUTH_ERROR.INVALID_CREDENTIALS);
    }
    if (!(await verify(user.passwordHash, password))) {
      const locked = await this.recordFailedLogin(user, requestId);
      throw new UnauthorizedException(
        locked ? AUTH_ERROR.ACCOUNT_LOCKED : AUTH_ERROR.INVALID_CREDENTIALS,
      );
    }

    return this.prisma.$transaction(async (transaction) => {
      const reset = await transaction.user.updateMany({
        where: { id: user.id, status: USER_STATUS.ACTIVE },
        data: {
          failedLoginAttempts: 0,
          lockedAt: null,
          lockReason: null,
          lastLoginAt: new Date(),
        },
      });
      if (reset.count !== 1) {
        throw new UnauthorizedException(AUTH_ERROR.INVALID_CREDENTIALS);
      }
      const pair = await this.createSession(transaction, user);
      return pair;
    });
  }

  async changePassword(
    principal: AuthPrincipal,
    input: ChangePasswordDto,
    requestId: string,
  ): Promise<void> {
    this.ensureDatabaseEnabled();
    const user = await this.prisma.user.findUnique({
      where: { id: toDatabaseId(principal.userId) },
    });
    if (!user?.passwordHash || user.status !== USER_STATUS.ACTIVE) {
      throw new UnauthorizedException('Account is unavailable');
    }
    const currentPassword = input.currentPassword.trim();
    const newPassword = input.newPassword.trim();
    if (!(await verify(user.passwordHash, currentPassword))) {
      throw new BadRequestException({
        code: 'CURRENT_PASSWORD_INCORRECT',
        message: 'Current password is incorrect',
      });
    }
    if (await verify(user.passwordHash, newPassword)) {
      throw new BadRequestException({
        code: 'PASSWORD_UNCHANGED',
        message: 'New password must be different from the current password',
      });
    }
    const passwordHash = await hash(newPassword);
    await this.prisma.$transaction(async (transaction) => {
      const changed = await transaction.user.updateMany({
        where: { id: user.id, version: user.version, status: USER_STATUS.ACTIVE },
        data: {
          passwordHash,
          mustChangePassword: false,
          failedLoginAttempts: 0,
          lockedAt: null,
          lockReason: null,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException('Account changed; retry password change');
      }

      /**
       * SECURITY: đổi mật khẩu phải đá mọi phiên khác ra ngoài.
       *
       * Lý do người ta đổi mật khẩu thường là nghi có người khác đang dùng tài khoản của mình. Giữ
       * nguyên các phiên đang mở nghĩa là kẻ đó vẫn ở trong hệ thống với refresh token cũ cho tới
       * khi nó hết hạn — đúng thứ mà thao tác đổi mật khẩu lẽ ra phải chặn.
       *
       * Phiên hiện tại được giữ lại để người dùng không bị đăng xuất khỏi chính thiết bị họ vừa
       * thao tác.
       */
      const revokedSessions = await transaction.authSession.updateMany({
        where: {
          userId: user.id,
          revokedAt: null,
          ...(principal.sessionId ? { id: { not: toDatabaseId(principal.sessionId) } } : {}),
        },
        data: { revokedAt: new Date(), revokeReason: 'PASSWORD_CHANGED' },
      });

      await this.audit.write(
        {
          requestId,
          sequenceNo: 1,
          actorType: 'USER',
          actorUserId: toEntityId(user.id),
          action: AUTH_AUDIT_ACTION.PASSWORD_CHANGE,
          entityType: 'USER',
          entityId: toEntityId(user.id),
          before: { mustChangePassword: user.mustChangePassword },
          // SECURITY: audit không chép mật khẩu; chỉ ghi số phiên bị thu hồi để tra lại về sau.
          after: { mustChangePassword: false, revokedSessions: revokedSessions.count },
        },
        transaction,
      );

      /**
       * Báo cho chủ tài khoản biết mật khẩu vừa đổi — nếu không phải họ làm thì đây là tín hiệu
       * duy nhất họ nhận được.
       *
       * TRANSACTION: ghi ý định trong cùng transaction với việc đổi mật khẩu. Đổi mật khẩu hỏng thì
       * email cũng không gửi; email hỏng thì worker thử lại, không ai phải đổi mật khẩu lần nữa.
       */
      if (user.email) {
        await this.outbox.append(
          {
            aggregateType: 'USER',
            aggregateId: toEntityId(user.id),
            eventType: OUTBOX_EVENT_TYPE.PASSWORD_CHANGED,
            payload: {
              recipientEmail: user.email,
              recipientName: user.displayName,
              changedAt: new Date().toLocaleString('vi-VN', { timeZone: VIETNAM_TIME_ZONE }),
              revokedSessions: revokedSessions.count,
            },
          },
          transaction,
        );
      }
    });
  }

  async registerCustomer(
    input: RegisterCustomerDto,
    requestId: string,
  ): Promise<TokenPairDto> {
    this.ensureDatabaseEnabled();
    const normalizedEmail = input.email?.trim().toLowerCase() || undefined;
    const normalizedPhone = input.phone
      ? this.normalizeRegistrationPhone(input.phone)
      : undefined;
    if (!normalizedEmail && !normalizedPhone) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Email or phone is required',
        details: [{ field: 'email', code: 'IDENTITY_REQUIRED', message: 'Provide email or phone' }],
      });
    }

    const passwordHash = await hash(input.password.trim());
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const user = await transaction.user.create({
          data: {
            userType: USER_TYPE.CUSTOMER,
            email: normalizedEmail,
            normalizedEmail,
            phone: normalizedPhone,
            normalizedPhone,
            passwordHash,
            displayName: input.displayName.trim(),
            status: USER_STATUS.ACTIVE,
          },
        });
        await this.audit.write(
          {
            requestId,
            sequenceNo: 1,
            actorType: 'GUEST',
            action: 'auth.customer.register',
            entityType: 'USER',
            entityId: toEntityId(user.id),
            after: {
              userType: USER_TYPE.CUSTOMER,
              status: USER_STATUS.ACTIVE,
              hasEmail: Boolean(normalizedEmail),
              hasPhone: Boolean(normalizedPhone),
              verificationRequired: false,
            },
          },
          transaction,
        );
        return this.createSession(transaction, user);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Email or phone is already registered');
      }
      throw error;
    }
  }

  async refresh(rawRefreshToken: string): Promise<TokenPairDto> {
    this.ensureDatabaseEnabled();
    const refreshTokenHash = this.hashRefreshToken(rawRefreshToken);
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const session = await transaction.authSession.findUnique({
            where: { refreshTokenHash },
            include: { user: true },
          });
          if (
            !session ||
            session.revokedAt ||
            session.expiresAt <= new Date() ||
            session.user.status !== USER_STATUS.ACTIVE
          ) {
            throw new UnauthorizedException('Refresh token is invalid or expired');
          }

          const revoked = await transaction.authSession.updateMany({
            where: { id: session.id, revokedAt: null },
            data: { revokedAt: new Date(), revokeReason: 'ROTATED', lastUsedAt: new Date() },
          });
          if (revoked.count !== 1) {
            throw new UnauthorizedException('Refresh token has already been used');
          }
          return this.createSession(transaction, session.user, session.id);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new UnauthorizedException('Refresh token has already been used');
      }
      throw error;
    }
  }

  async logout(rawRefreshToken: string): Promise<void> {
    this.ensureDatabaseEnabled();
    await this.prisma.authSession.updateMany({
      where: { refreshTokenHash: this.hashRefreshToken(rawRefreshToken), revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: 'LOGOUT' },
    });
  }

  async authorizeAccessToken(rawAccessToken: string): Promise<AuthPrincipal> {
    this.ensureDatabaseEnabled();
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(rawAccessToken);
    } catch {
      throw new UnauthorizedException('Access token is invalid or expired');
    }
    if (payload.typ !== 'access' || !payload.sub || !payload.sid) {
      throw new UnauthorizedException('Access token is invalid');
    }

    const now = new Date();
    // SECURITY: Session row is re-checked on every request so a revoked or expired session stops
    // working immediately; only the role/permission projection below is cached.
    const session = await this.prisma.authSession.findFirst({
      where: {
        id: toDatabaseId(payload.sid),
        userId: toDatabaseId(payload.sub),
        revokedAt: null,
        expiresAt: { gt: now },
      },
      select: {
        id: true,
        user: {
          select: {
            id: true,
            displayName: true,
            status: true,
            permissionVersion: true,
            mustChangePassword: true,
          },
        },
      },
    });
    if (
      !session ||
      session.user.status !== USER_STATUS.ACTIVE ||
      session.user.permissionVersion.toString() !== payload.pv
    ) {
      throw new UnauthorizedException('Access token is no longer valid');
    }

    const grants = await this.resolveGrants(session.user.id, payload.pv, now);
    return {
      userId: toEntityId(session.user.id),
      sessionId: toEntityId(session.id),
      displayName: session.user.displayName,
      permissionVersion: session.user.permissionVersion.toString(),
      permissions: grants.permissions,
      scopes: grants.scopes,
      mustChangePassword: session.user.mustChangePassword,
    };
  }

  /**
   * Resolve the effective permission codes and data scopes of one user.
   *
   * SECURITY: The cache key carries `permissionVersion`, which the IAM module bumps on every
   * role/assignment change. A permission change therefore produces a different key and can never be
   * served from a stale entry, so the short TTL only bounds memory, not correctness. Each replica
   * caches independently for the same reason.
   */
  private async resolveGrants(
    userId: bigint,
    permissionVersion: string,
    now: Date,
  ): Promise<{ permissions: string[]; scopes: AuthScope[] }> {
    const cacheKey = `${userId.toString()}:${permissionVersion}`;
    const cached = this.grantCache.get(cacheKey);
    if (cached && cached.expiresAt > now.getTime()) {
      return cached.value;
    }

    const assignments = await this.prisma.userRoleAssignment.findMany({
      where: {
        userId,
        status: ROLE_ASSIGNMENT_STATUS.ACTIVE,
        validFrom: { lte: now },
        OR: [{ validTo: null }, { validTo: { gt: now } }],
        role: { status: ROLE_STATUS.ACTIVE },
      },
      select: {
        scopeType: true,
        branchId: true,
        validTo: true,
        role: { select: { permissions: { select: { permission: { select: { code: true } } } } } },
      },
    });

    const value = {
      permissions: [
        ...new Set(
          assignments.flatMap(({ role }) =>
            role.permissions.map(({ permission }) => permission.code),
          ),
        ),
      ],
      scopes: assignments.map((assignment) => ({
        type: assignment.scopeType as ScopeType,
        ...(assignment.branchId ? { branchId: toEntityId(assignment.branchId) } : {}),
      })),
    };

    // INVARIANT: khoá cache chỉ gồm userId và permissionVersion, nên nó chỉ bắt được việc mất
    // quyền do CÓ NGƯỜI SỬA dữ liệu (mọi đường đó đều bump permissionVersion). Quyền hết hạn do
    // THỜI GIAN TRÔI QUA không bump gì cả, nên không được phép cache. V1 chưa cho đặt valid_to ở
    // tương lai (UserRoleAssignmentDto không có field này, iam.service luôn đặt validFrom = now),
    // nhưng cột vẫn tồn tại trong schema — nếu sau này mở tính năng cấp quyền có thời hạn thì
    // nhánh dưới đây giữ cho cache không bao giờ trả quyền đã hết hiệu lực.
    const hasPendingExpiry = assignments.some(
      (assignment) => assignment.validTo !== null && assignment.validTo.getTime() > now.getTime(),
    );
    if (hasPendingExpiry) {
      return value;
    }

    if (this.grantCache.size >= AUTH_GRANT_CACHE_MAX_ENTRIES) {
      this.grantCache.clear();
    }
    this.grantCache.set(cacheKey, {
      value,
      expiresAt: now.getTime() + AUTH_GRANT_CACHE_TTL_MS,
    });
    return value;
  }

  private async createSession(
    transaction: Prisma.TransactionClient,
    user: User,
    rotatedFromId?: bigint,
  ): Promise<TokenPairDto> {
    const refreshToken = randomBytes(48).toString('base64url');
    const refreshTtlSeconds = this.config.get<number>('app.jwt.refreshTtlSeconds') ?? 2_592_000;
    const session = await transaction.authSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: this.hashRefreshToken(refreshToken),
        rotatedFromId,
        expiresAt: new Date(Date.now() + refreshTtlSeconds * 1_000),
      },
    });
    const accessTtlSeconds = this.config.get<number>('app.jwt.accessTtlSeconds') ?? 900;
    const accessToken = await this.jwt.signAsync(
      {
        sub: toEntityId(user.id),
        sid: toEntityId(session.id),
        pv: user.permissionVersion.toString(),
        typ: 'access',
      },
      { expiresIn: accessTtlSeconds },
    );
    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: accessTtlSeconds,
      mustChangePassword: user.mustChangePassword,
    };
  }

  private async recordFailedLogin(user: User, requestId: string): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<
        Array<{ status: string; failedLoginAttempts: number; lockedAt: Date | null }>
      >(Prisma.sql`
        UPDATE "users"
        SET
          "failed_login_attempts" = "failed_login_attempts" + 1,
          "status" = CASE
            WHEN "failed_login_attempts" + 1 >= ${AUTH_SECURITY.MAX_FAILED_LOGIN_ATTEMPTS}
              THEN ${USER_STATUS.LOCKED}
            ELSE "status"
          END,
          "locked_at" = CASE
            WHEN "failed_login_attempts" + 1 >= ${AUTH_SECURITY.MAX_FAILED_LOGIN_ATTEMPTS}
              THEN NOW()
            ELSE "locked_at"
          END,
          "lock_reason" = CASE
            WHEN "failed_login_attempts" + 1 >= ${AUTH_SECURITY.MAX_FAILED_LOGIN_ATTEMPTS}
              THEN ${AUTH_SECURITY.AUTO_LOCK_REASON}
            ELSE "lock_reason"
          END,
          "permission_version" = CASE
            WHEN "failed_login_attempts" + 1 >= ${AUTH_SECURITY.MAX_FAILED_LOGIN_ATTEMPTS}
              THEN "permission_version" + 1
            ELSE "permission_version"
          END,
          "version" = "version" + 1,
          "updated_at" = NOW()
        WHERE "id" = ${user.id}::bigint AND "status" = ${USER_STATUS.ACTIVE}
        RETURNING
          "status",
          "failed_login_attempts" AS "failedLoginAttempts",
          "locked_at" AS "lockedAt"
      `);
      const result = rows[0];
      if (result?.status !== USER_STATUS.LOCKED) return false;

      const revoked = await transaction.authSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: result.lockedAt ?? new Date(), revokeReason: 'ACCOUNT_AUTO_LOCKED' },
      });
      await this.audit.write(
        {
          requestId,
          sequenceNo: 1,
          actorType: 'GUEST',
          action: AUTH_AUDIT_ACTION.ACCOUNT_AUTO_LOCK,
          entityType: 'USER',
          entityId: toEntityId(user.id),
          before: {
            status: USER_STATUS.ACTIVE,
            failedLoginAttempts: AUTH_SECURITY.MAX_FAILED_LOGIN_ATTEMPTS - 1,
          },
          after: {
            status: USER_STATUS.LOCKED,
            failedLoginAttempts: result.failedLoginAttempts,
            revokedSessionCount: revoked.count,
          },
          reason: AUTH_SECURITY.AUTO_LOCK_REASON,
        },
        transaction,
      );
      return true;
    });
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private normalizeLoginIdentifier(identifier: string): {
    type: 'EMAIL' | 'PHONE';
    value: string;
  } {
    const value = identifier.trim();
    if (value.includes('@')) return { type: 'EMAIL', value: value.toLowerCase() };
    try {
      return { type: 'PHONE', value: normalizeVietnamesePhone(value) };
    } catch (error) {
      if (error instanceof InvalidVietnamesePhoneNumberError) {
        throw new UnauthorizedException('Email/phone or password is incorrect');
      }
      throw error;
    }
  }

  private normalizeRegistrationPhone(phone: string): string {
    try {
      return normalizeVietnamesePhone(phone);
    } catch (error) {
      if (error instanceof InvalidVietnamesePhoneNumberError) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Phone number is invalid',
          details: [{ field: 'phone', code: 'INVALID_PHONE', message: 'Vietnamese phone number is invalid' }],
        });
      }
      throw error;
    }
  }

  private ensureDatabaseEnabled(): void {
    if (!this.prisma.isEnabled()) {
      throw new UnauthorizedException('Authentication is unavailable');
    }
  }
}
