import { ServiceUnavailableException } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';
import { PrismaService } from '../../database/prisma.service';
import { WriteAuditLogInput, WrittenAuditLog } from './audit.types';

export abstract class AuditWriter {
  abstract write(input: WriteAuditLogInput): Promise<WrittenAuditLog>;
}

export class PrismaAuditWriter extends AuditWriter {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async write(input: WriteAuditLogInput): Promise<WrittenAuditLog> {
    if (!this.prisma.isEnabled()) {
      throw new ServiceUnavailableException('Durable audit storage is not enabled');
    }
    const result = await this.prisma.auditLog.create({
      data: {
        id: uuidv7(),
        requestId: input.requestId,
        sequenceNo: input.sequenceNo,
        actorType: input.actorType,
        actorUserId: input.actorUserId,
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
    return { id: result.id, createdAt: result.createdAt.toISOString() };
  }
}
