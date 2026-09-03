import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ScopeType } from '../iam/iam.types';
import type { AuthPrincipal } from '../auth/auth.types';
import { AuditListDto, AuditQueryDto } from './audit.dto';
import { redactAuditValue } from './audit-redaction';

interface AuditCursor {
  createdAt: string;
  id: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AuditQueryDto, principal: AuthPrincipal): Promise<AuditListDto> {
    if (!principal.scopes.some((scope) => scope.type === ScopeType.GLOBAL)) {
      throw new ForbiddenException('Global scope is required to view audit logs');
    }
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : undefined;
    const where: Prisma.AuditLogWhereInput = {
      ...(query.action
        ? { action: { contains: query.action.trim(), mode: 'insensitive' } }
        : {}),
      ...(query.entityType ? { entityType: query.entityType.trim().toUpperCase() } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.requestId
        ? { requestId: { contains: query.requestId.trim(), mode: 'insensitive' } }
        : {}),
      ...((query.from || query.to) && {
        createdAt: {
          ...(query.from ? { gte: new Date(query.from) } : {}),
          ...(query.to ? { lte: new Date(query.to) } : {}),
        },
      }),
      ...(cursor && {
        OR: [
          { createdAt: { lt: new Date(cursor.createdAt) } },
          { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
        ],
      }),
    };
    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: { actor: { select: { displayName: true } } },
    });
    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map((row) => ({
        id: row.id,
        requestId: row.requestId,
        sequenceNo: row.sequenceNo,
        actorType: row.actorType,
        actorUserId: row.actorUserId,
        actorDisplayName: row.actor?.displayName ?? null,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        before: redactAuditValue(row.beforeJson) as object | null,
        after: redactAuditValue(row.afterJson) as object | null,
        reason: row.reason,
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor: hasMore && last
        ? Buffer.from(JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id }))
            .toString('base64url')
        : null,
    };
  }

  private decodeCursor(value: string): AuditCursor {
    try {
      const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as AuditCursor;
      if (!cursor.id || Number.isNaN(new Date(cursor.createdAt).getTime())) throw new Error();
      return cursor;
    } catch {
      throw new BadRequestException('Audit cursor is invalid');
    }
  }
}
