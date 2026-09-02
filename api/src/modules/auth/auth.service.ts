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
import { PrismaService } from '../../database/prisma.service';
import { AuditWriter } from '../audit/audit.writer';
import {
  ROLE_ASSIGNMENT_STATUS,
  ROLE_STATUS,
  USER_STATUS,
  USER_TYPE,
} from '../iam/iam.constants';
import { ScopeType } from '../iam/iam.types';
import { LoginDto, RegisterCustomerDto, TokenPairDto } from './auth.dto';
import { AccessTokenPayload, AuthPrincipal } from './auth.types';
import {
  InvalidVietnamesePhoneNumberError,
  normalizeVietnamesePhone,
} from './phone-normalization';

type LoginUserType = typeof USER_TYPE.CUSTOMER | typeof USER_TYPE.STAFF;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditWriter,
  ) {}

  async login(
    input: LoginDto,
    userType: LoginUserType = USER_TYPE.STAFF,
  ): Promise<TokenPairDto> {
    this.ensureDatabaseEnabled();
    const identity = this.normalizeLoginIdentifier(input.identifier);
    const user = await this.prisma.user.findFirst({
      where: {
        userType,
        ...(identity.type === 'EMAIL'
          ? { normalizedEmail: identity.value }
          : { normalizedPhone: identity.value }),
      },
    });
    if (
      !user?.passwordHash ||
      user.status !== USER_STATUS.ACTIVE ||
      !(await verify(user.passwordHash, input.password))
    ) {
      throw new UnauthorizedException('Email/phone or password is incorrect');
    }

    return this.prisma.$transaction(async (transaction) => {
      const pair = await this.createSession(transaction, user);
      await transaction.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
      return pair;
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

    const userId = uuidv7();
    const passwordHash = await hash(input.password);
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const user = await transaction.user.create({
          data: {
            id: userId,
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
            entityId: user.id,
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
    const session = await this.prisma.authSession.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      include: {
        user: {
          include: {
            roleAssignments: {
              where: {
                status: ROLE_ASSIGNMENT_STATUS.ACTIVE,
                validFrom: { lte: now },
                OR: [{ validTo: null }, { validTo: { gt: now } }],
              },
              include: {
                role: {
                  include: { permissions: { include: { permission: true } } },
                },
              },
            },
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

    const activeAssignments = session.user.roleAssignments.filter(
      ({ role }) => role.status === ROLE_STATUS.ACTIVE,
    );
    return {
      userId: session.user.id,
      sessionId: session.id,
      displayName: session.user.displayName,
      permissionVersion: session.user.permissionVersion.toString(),
      permissions: [
        ...new Set(
          activeAssignments.flatMap(({ role }) =>
            role.permissions.map(({ permission }) => permission.code),
          ),
        ),
      ],
      scopes: activeAssignments.map((assignment) => ({
        type: assignment.scopeType as ScopeType,
        ...(assignment.branchId ? { branchId: assignment.branchId } : {}),
      })),
    };
  }

  private async createSession(
    transaction: Prisma.TransactionClient,
    user: User,
    rotatedFromId?: string,
  ): Promise<TokenPairDto> {
    const sessionId = uuidv7();
    const refreshToken = randomBytes(48).toString('base64url');
    const refreshTtlSeconds = this.config.get<number>('app.jwt.refreshTtlSeconds') ?? 2_592_000;
    await transaction.authSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        refreshTokenHash: this.hashRefreshToken(refreshToken),
        rotatedFromId,
        expiresAt: new Date(Date.now() + refreshTtlSeconds * 1_000),
      },
    });
    const accessTtlSeconds = this.config.get<number>('app.jwt.accessTtlSeconds') ?? 900;
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, sid: sessionId, pv: user.permissionVersion.toString(), typ: 'access' },
      { expiresIn: accessTtlSeconds },
    );
    return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn: accessTtlSeconds };
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
