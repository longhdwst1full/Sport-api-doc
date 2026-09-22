import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { hash } from 'argon2';
import { PrismaService } from '../../database/prisma.service';
import { toEntityId } from '../../common/identifiers/entity-id';
import { AuditWriter } from '../audit/audit.writer';
import { IntegrationConfigService } from '../system/parameters/integration-config.service';
import { OutboxWriter } from '../notification/outbox.writer';
import {
  OUTBOX_EVENT_TYPE,
  PASSWORD_RESET_TTL_MINUTES,
} from '../notification/notification.constants';
import { AUTH_AUDIT_ACTION } from './auth.constants';
import { USER_STATUS, USER_TYPE } from '../iam/iam.constants';
import type { ForgotPasswordDto, ResetPasswordDto } from './auth.dto';

/** Token thô dài 32 byte; hash SHA-256 để tra cứu bằng một phép so khớp chỉ mục. */
const TOKEN_BYTES = 32;

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
    private readonly integrations: IntegrationConfigService,
  ) {}

  /**
   * Nhận yêu cầu đặt lại mật khẩu.
   *
   * SECURITY: **luôn trả về như nhau** dù email có tồn tại hay không. Trả lời khác nhau biến endpoint
   * này thành công cụ dò xem ai có tài khoản ở đây — thứ dùng được cho lừa đảo nhắm mục tiêu.
   *
   * Vì vậy hàm này không bao giờ ném lỗi "không tìm thấy"; nó chỉ lặng lẽ không làm gì.
   */
  async requestReset(input: ForgotPasswordDto, requestId: string, ipHash?: string): Promise<void> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: {
        normalizedEmail,
        userType: USER_TYPE.CUSTOMER,
        status: USER_STATUS.ACTIVE,
      },
      select: { id: true, email: true, displayName: true },
    });
    if (!user?.email) {
      this.logger.log({ message: 'Password reset requested for unknown email', requestId });
      return;
    }

    const rawToken = randomBytes(TOKEN_BYTES).toString('base64url');
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60_000);
    const { baseUrl } = await this.integrations.storefront();

    await this.prisma.$transaction(async (transaction) => {
      /**
       * Huỷ mọi token chưa dùng trước đó của người này.
       *
       * Bấm "quên mật khẩu" ba lần thì chỉ link mới nhất còn tác dụng. Giữ cả ba nghĩa là hai link
       * cũ vẫn nằm trong hộp thư và vẫn đổi được mật khẩu.
       */
      await transaction.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });

      await transaction.passwordResetToken.create({
        data: {
          userId: user.id,
          // SECURITY: chỉ lưu hash. Rò database thì không dựng lại được link trong email.
          tokenHash: hashToken(rawToken),
          expiresAt,
          requestIpHash: ipHash ?? null,
        },
      });

      // TRANSACTION: token và email ra đời cùng nhau. Ghi token xong mới gửi email ở ngoài
      // transaction thì token có thật mà email không bao giờ tới, và khách không biết vì sao.
      await this.outbox.append(
        {
          aggregateType: 'USER',
          aggregateId: toEntityId(user.id),
          eventType: OUTBOX_EVENT_TYPE.PASSWORD_RESET_REQUESTED,
          payload: {
            recipientEmail: user.email,
            recipientName: user.displayName,
            resetUrl: `${baseUrl}/reset-password?token=${rawToken}`,
            expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
          },
        },
        transaction,
      );

      await this.audit.write(
        {
          requestId,
          sequenceNo: 1,
          actorType: 'SYSTEM',
          action: AUTH_AUDIT_ACTION.PASSWORD_RESET_REQUESTED,
          entityType: 'USER',
          entityId: toEntityId(user.id),
          // SECURITY: audit không chép token lẫn link; chỉ ghi việc đã xảy ra.
          after: { expiresAt: expiresAt.toISOString() },
        },
        transaction,
      );
    });
  }

  /**
   * Đổi mật khẩu bằng token trong email.
   *
   * INVARIANT: token dùng đúng một lần và chỉ trong thời hạn. Cả hai điều kiện nằm trong `updateMany`
   * để hai lần bấm đồng thời chỉ có một lần thắng — kiểm trước rồi ghi sau là chỗ để cả hai cùng qua.
   */
  async resetPassword(input: ResetPasswordDto, requestId: string): Promise<void> {
    const tokenHash = hashToken(input.token);
    const now = new Date();
    const token = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, expiresAt: true, usedAt: true },
    });
    // Cùng một thông báo cho mọi lý do: token sai, hết hạn hay đã dùng đều không cho biết thêm gì.
    if (!token || token.usedAt || token.expiresAt <= now) {
      throw new BadRequestException({
        code: 'PASSWORD_RESET_TOKEN_INVALID',
        message: 'Đường dẫn đặt lại mật khẩu không hợp lệ hoặc đã hết hạn',
      });
    }

    const passwordHash = await hash(input.newPassword.trim());
    await this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.passwordResetToken.updateMany({
        where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException({
          code: 'PASSWORD_RESET_TOKEN_INVALID',
          message: 'Đường dẫn đặt lại mật khẩu không hợp lệ hoặc đã hết hạn',
        });
      }

      await transaction.user.update({
        where: { id: token.userId },
        data: {
          passwordHash,
          mustChangePassword: false,
          // Đặt lại mật khẩu cũng là đường gỡ khoá cho tài khoản bị khoá do sai mật khẩu nhiều lần.
          failedLoginAttempts: 0,
          lockedAt: null,
          lockReason: null,
          version: { increment: 1 },
        },
      });

      /**
       * SECURITY: thu hồi **toàn bộ** phiên, kể cả phiên đang mở.
       *
       * Khác với đổi mật khẩu khi đã đăng nhập — ở đó người dùng đang ngồi trước máy nên giữ lại
       * phiên hiện tại. Ở đây họ vừa lấy lại tài khoản qua email, mọi phiên đang mở đều có khả năng
       * là của người chiếm tài khoản.
       */
      await transaction.authSession.updateMany({
        where: { userId: token.userId, revokedAt: null },
        data: { revokedAt: now, revokeReason: 'PASSWORD_RESET' },
      });

      await this.audit.write(
        {
          requestId,
          sequenceNo: 1,
          actorType: 'SYSTEM',
          action: AUTH_AUDIT_ACTION.PASSWORD_RESET_COMPLETED,
          entityType: 'USER',
          entityId: toEntityId(token.userId),
          after: { resetTokenId: token.id.toString() },
        },
        transaction,
      );
    });
  }

  /** Băm IP để điều tra lạm dụng mà không lưu IP thô. */
  static hashIp(ip: string | undefined): string | undefined {
    if (!ip) return undefined;
    return createHash('sha256').update(ip).digest('hex');
  }
}
