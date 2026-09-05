import { ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toEntityId, toOptionalDatabaseId } from '../../common/identifiers/entity-id';
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
    const result = await (transaction ?? this.prisma).auditLog.create({
      data: {
        requestId: input.requestId,
        sequenceNo: input.sequenceNo,
        actorType: input.actorType,
        actorUserId: toOptionalDatabaseId(input.actorUserId),
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
