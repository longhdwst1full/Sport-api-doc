import { ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toActorDatabaseId, toEntityId } from '../../common/identifiers/entity-id';
import { PrismaService } from '../../database/prisma.service';
import { WriteAuditLogInput, WrittenAuditLog } from './audit.types';

export abstract class AuditWriter {
  abstract write(
    input: WriteAuditLogInput,
    transaction?: Prisma.TransactionClient,
  ): Promise<WrittenAuditLog>;
}

export class PrismaAuditWriter extends AuditWriter {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async write(
    input: WriteAuditLogInput,
    transaction?: Prisma.TransactionClient,
  ): Promise<WrittenAuditLog> {
    if (!this.prisma.isEnabled()) {
      throw new ServiceUnavailableException('Durable audit storage is not enabled');
    }
    // Ràng buộc `audit_logs_actor_consistency_check`: actorType USER bắt buộc có
    // actor_user_id; SYSTEM/GUEST bắt buộc để trống. Actor không phải user trong
    // database (system principal, hoặc principal giả lập khi bật AUTH_BYPASS) thì
    // ghi là SYSTEM — đúng sự thật hơn là gán bừa một user, và không làm hỏng
    // nghiệp vụ hợp lệ vì vi phạm ràng buộc.
    const actorUserId = toActorDatabaseId(input.actorUserId);
    const actorType = input.actorType === 'USER' && actorUserId === undefined
      ? 'SYSTEM'
      : input.actorType;

    const result = await (transaction ?? this.prisma).auditLog.create({
      data: {
        requestId: input.requestId,
        sequenceNo: input.sequenceNo,
        actorType,
        actorUserId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        beforeJson: input.before,
        afterJson: input.after,
        reason: input.reason,
        ipHash: input.ipHash,
        userAgentHash: input.userAgentHash,
      },
      select: { id: true, createdAt: true },
    });
    return { id: toEntityId(result.id), createdAt: result.createdAt.toISOString() };
  }
}
