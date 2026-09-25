import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { MutationContext } from '../../../common/request/request-context';
import type { AuditReader } from '../../audit/audit.reader';

/**
 * Idempotency theo `x-request-id` cho lệnh Admin của Catalog, không cần bảng riêng (cùng cách với
 * createAdminProduct): kết quả lưu là audit của chính request, `after_json.idempotency` chứa fingerprint.
 *
 * TRANSACTION: `lockRequest` phải chạy đầu transaction. AuditWriter tự cấp sequence_no = MAX + 1 nên
 * unique (request_id, sequence_no) KHÔNG chặn được request thứ hai cùng id; advisory lock theo id mới là
 * thứ bắt các request cùng id chạy tuần tự để lần tra audit thấy kết quả đã commit.
 * Phụ thuộc: audit phải ghi đồng bộ trong cùng transaction với thay đổi nghiệp vụ.
 */
export const REQUEST_FINGERPRINT_VERSION = 1;
export const MAX_REQUEST_ID_LENGTH = 100;

export interface RequestFingerprint {
  fingerprintVersion: number;
  requestHash: string;
}

/**
 * SHA-256 của operation + method + actor + input; key object sắp xếp cố định, thứ tự mảng giữ nguyên.
 * CONTRACT: đúng object mà createAdminProduct băm từ đầu — đổi cấu trúc thì phải tăng
 * REQUEST_FINGERPRINT_VERSION, nếu không lần gửi lại của request cũ sẽ bị coi là xung đột.
 */
export function requestFingerprint(
  operation: string,
  method: 'POST' | 'PUT' | 'PATCH',
  context: MutationContext,
  input: unknown,
): RequestFingerprint {
  return {
    fingerprintVersion: REQUEST_FINGERPRINT_VERSION,
    requestHash: createHash('sha256')
      .update(canonicalJson({ fingerprintVersion: REQUEST_FINGERPRINT_VERSION, operation, method, actorUserId: context.actorUserId, input }))
      .digest('hex'),
  };
}

export async function lockRequest(transaction: Prisma.TransactionClient, scope: string, requestId: string): Promise<void> {
  await transaction.$queryRaw`
    SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`${scope}:${requestId}`}, 0))) AS locked`;
}

/**
 * Trả entityId của lần chạy trước cùng request id, hoặc undefined nếu id chưa dùng.
 * INVARIANT: id đã gắn với thao tác khác, người khác, payload khác hoặc version hash khác → 409, không
 * chạy lại và không trả kết quả cũ.
 */
export async function findReplay(
  transaction: Prisma.TransactionClient,
  auditReader: AuditReader,
  context: MutationContext,
  expected: { action: string; entityType: string; fingerprint: RequestFingerprint; conflictCode: string; conflictMessage: string },
): Promise<string | undefined> {
  const entries = await auditReader.findByRequestId(context.requestId, transaction);
  if (entries.length === 0) return undefined;
  const match = entries.find((entry) => entry.action === expected.action && entry.entityType === expected.entityType);
  const stored = (match?.after as { idempotency?: Partial<RequestFingerprint> } | null)?.idempotency;
  if (
    !match?.entityId ||
    stored?.fingerprintVersion !== expected.fingerprint.fingerprintVersion ||
    stored.requestHash !== expected.fingerprint.requestHash
  ) {
    throw new ConflictException({ code: expected.conflictCode, message: expected.conflictMessage });
  }
  return match.entityId;
}

/** JSON với key object sắp xếp cố định để cùng nội dung luôn ra cùng hash; bỏ key undefined như JSON.stringify. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item ?? null)).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}
