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
    // actor_user_id; SYSTEM/GUEST bắt buộc để trống.
    //
    // Phân biệt hai tình huống khác hẳn nhau:
    // - Caller KHÔNG truyền actor nào (`undefined`): đó là lỗi lập trình. Để
    //   database từ chối và rollback, không được âm thầm nuốt mất attribution.
    // - Caller truyền một danh tính KHÔNG PHẢI user trong database (system
    //   principal của worker, hoặc principal giả lập khi bật AUTH_BYPASS — cả hai
    //   đều mang ID dạng không phải số): ghi là SYSTEM. Đúng sự thật hơn gán bừa
    //   một user, và không chặn nghiệp vụ hợp lệ.
    const actorUserId = toActorDatabaseId(input.actorUserId);
    const hasNonDatabaseActor =
      input.actorUserId !== undefined && input.actorUserId !== null && actorUserId === undefined;
    const actorType =
      input.actorType === 'USER' && hasNonDatabaseActor ? 'SYSTEM' : input.actorType;

    // `@@unique([requestId, sequenceNo])`: một HTTP request ghi nhiều audit thì mỗi bản
    // ghi phải mang số thứ tự riêng. Phần lớn luồng chỉ ghi một bản nên caller truyền 1;
    // luồng ghép nhiều nghiệp vụ (bán tại quầy: checkout -> giữ hàng -> đặt -> thu tiền ->
    // giao) thì các bước sau phải nối tiếp. Cấp số ngay trong câu INSERT để không tốn thêm
    // round-trip và để không phải bắt lỗi trùng bên trong transaction (lỗi ràng buộc làm
    // Postgres huỷ cả transaction, không retry được tại chỗ).
    const client = transaction ?? this.prisma;
    const [result] = await client.$queryRaw<{ id: bigint; created_at: Date }[]>`
      INSERT INTO public.audit_logs (
        request_id, sequence_no, actor_type, actor_user_id, action,
        entity_type, entity_id, before_json, after_json, reason, ip_hash, user_agent_hash
      ) VALUES (
        ${input.requestId},
        GREATEST(
          ${input.sequenceNo}::int,
          COALESCE((SELECT MAX(sequence_no) FROM public.audit_logs WHERE request_id = ${input.requestId}), 0) + 1
        ),
        ${actorType}, ${actorUserId ?? null}, ${input.action},
        ${input.entityType}, ${input.entityId ?? null},
        ${input.before === undefined || input.before === null ? null : JSON.stringify(input.before)}::jsonb,
        ${input.after === undefined || input.after === null ? null : JSON.stringify(input.after)}::jsonb,
        ${input.reason ?? null}, ${input.ipHash ?? null}, ${input.userAgentHash ?? null}
      )
      RETURNING id, created_at
    `;
    if (!result) {
      throw new ServiceUnavailableException('Audit log write returned no row');
    }
    return { id: toEntityId(result.id), createdAt: result.created_at.toISOString() };
  }
}
