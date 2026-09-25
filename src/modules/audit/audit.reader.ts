import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toEntityId } from '../../common/identifiers/entity-id';
import { PrismaService } from '../../database/prisma.service';

export interface RequestAuditEntry {
  action: string;
  entityType: string;
  entityId: string | null;
  actorUserId: string | null;
  after: Prisma.JsonValue | null;
}

/**
 * Cổng đọc hẹp của `audit_logs` cho module khác: chỉ tra các bản ghi của một request.
 *
 * Tách khỏi `AuditWriter` để module nghiệp vụ không truy vấn thẳng bảng của Audit và không đổi
 * hợp đồng ghi đang dùng ở mọi module.
 */
@Injectable()
export class AuditReader {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * TRANSACTION: truyền `transaction` khi cần đọc sau một lock trong cùng transaction; đọc bằng
   * client gốc thì chỉ thấy dữ liệu đã commit tại thời điểm câu lệnh chạy.
   */
  async findByRequestId(
    requestId: string,
    transaction?: Prisma.TransactionClient,
  ): Promise<RequestAuditEntry[]> {
    const rows = await (transaction ?? this.prisma).auditLog.findMany({
      where: { requestId },
      orderBy: { sequenceNo: 'asc' },
      select: { action: true, entityType: true, entityId: true, actorUserId: true, afterJson: true },
    });
    return rows.map((row) => ({
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      actorUserId: row.actorUserId === null ? null : toEntityId(row.actorUserId),
      after: row.afterJson,
    }));
  }
}
