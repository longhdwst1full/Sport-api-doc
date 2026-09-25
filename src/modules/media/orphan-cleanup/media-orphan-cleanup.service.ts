import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { CLOUDINARY_DEFAULT_FOLDER } from '../../../config/cloudinary.config';
import { PrismaService } from '../../../database/prisma.service';
import { ObjectStorageClient } from '../../../integrations/object-storage/object-storage.client';
import { AuditWriter } from '../../audit/audit.writer';

/**
 * Dọn ảnh bằng chứng đã upload nhưng không bao giờ được gắn vào nghiệp vụ (khách ký upload rồi bỏ ngang).
 *
 * SECURITY / an toàn dữ liệu (quyết định 2026-09-25):
 * - Chỉ quét 3 thư mục bằng chứng; KHÔNG quét ảnh sản phẩm/brand/category hay toàn tài khoản.
 * - Chỉ ảnh cũ hơn 24 giờ và không được tham chiếu ở `media_assets` (ảnh chuyển khoản),
 *   `return_requests.evidence_images` hoặc `refunds.proof_images`.
 * - Mặc định DRY_RUN chỉ báo cáo; DELETE phải gọi tường minh và tối đa 100 ảnh/lượt để một lỗi lọc
 *   không thể xoá hàng loạt. Mỗi ảnh xoá ghi audit trước khi gọi provider.
 * Ảnh mồ côi không có dòng DB nào nên không có trạng thái PENDING_DELETE; audit là dấu vết duy nhất.
 */
export const MEDIA_ORPHAN_CLEANUP = {
  FOLDERS: ['payment-evidence', 'return-evidence', 'refund-proof'],
  RETENTION_HOURS: 24,
  MAX_DELETE_PER_RUN: 100,
  MAX_SCAN_PER_FOLDER: 5000,
  REPORT_LIMIT: 500,
  AUDIT_ACTION: 'media.orphan.delete',
} as const;

export type MediaOrphanMode = 'DRY_RUN' | 'DELETE';

export interface MediaOrphanCandidate {
  publicId: string;
  folder: string;
  createdAt: string;
  ageHours: number;
  sizeBytes: number;
}

export interface MediaOrphanReport {
  mode: MediaOrphanMode;
  scanned: number;
  referenced: number;
  tooRecent: number;
  candidates: number;
  deleted: number;
  failed: Array<{ publicId: string; error: string }>;
  /** Tối đa REPORT_LIMIT dòng để response không phình; `candidates` là tổng thật. */
  items: MediaOrphanCandidate[];
  truncatedScan: boolean;
}

@Injectable()
export class MediaOrphanCleanupService {
  private readonly logger = new Logger(MediaOrphanCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageClient,
    private readonly audit: AuditWriter,
    private readonly config: ConfigService,
  ) {}

  async run(mode: MediaOrphanMode, requestId: string, now = new Date()): Promise<MediaOrphanReport> {
    const root = this.config.get<string>('cloudinary.folder') ?? CLOUDINARY_DEFAULT_FOLDER;
    const cutoff = now.getTime() - MEDIA_ORPHAN_CLEANUP.RETENTION_HOURS * 3_600_000;
    const report: MediaOrphanReport = {
      mode, scanned: 0, referenced: 0, tooRecent: 0, candidates: 0, deleted: 0, failed: [], items: [], truncatedScan: false,
    };
    const orphans: MediaOrphanCandidate[] = [];

    for (const folder of MEDIA_ORPHAN_CLEANUP.FOLDERS) {
      const prefix = `${root}/${folder}/`;
      let cursor: string | undefined;
      let scannedInFolder = 0;
      do {
        const page = await this.storage.listImages(prefix, cursor);
        cursor = page.nextCursor;
        scannedInFolder += page.items.length;
        report.scanned += page.items.length;
        const old = page.items.filter((item) => item.createdAt.getTime() < cutoff);
        report.tooRecent += page.items.length - old.length;
        const referenced = await this.referencedPublicIds(old.map(({ publicId }) => publicId));
        for (const item of old) {
          if (referenced.has(item.publicId)) {
            report.referenced += 1;
            continue;
          }
          orphans.push({
            publicId: item.publicId,
            folder,
            createdAt: item.createdAt.toISOString(),
            ageHours: Math.floor((now.getTime() - item.createdAt.getTime()) / 3_600_000),
            sizeBytes: item.sizeBytes,
          });
        }
        if (scannedInFolder >= MEDIA_ORPHAN_CLEANUP.MAX_SCAN_PER_FOLDER && cursor) {
          report.truncatedScan = true;
          break;
        }
      } while (cursor);
    }

    report.candidates = orphans.length;
    report.items = orphans.slice(0, MEDIA_ORPHAN_CLEANUP.REPORT_LIMIT);
    if (mode === 'DELETE') {
      for (const orphan of orphans.slice(0, MEDIA_ORPHAN_CLEANUP.MAX_DELETE_PER_RUN)) {
        // Kiểm lại ngay trước khi xoá: ảnh có thể vừa được gắn vào phiếu trong lúc quét.
        if ((await this.referencedPublicIds([orphan.publicId])).size > 0) continue;
        try {
          await this.audit.write({
            requestId,
            sequenceNo: 1,
            actorType: 'SYSTEM',
            action: MEDIA_ORPHAN_CLEANUP.AUDIT_ACTION,
            entityType: 'MEDIA_PROVIDER_ASSET',
            entityId: orphan.publicId.slice(-100),
            after: { ...orphan } as unknown as Prisma.InputJsonValue,
            reason: `Ảnh bằng chứng không được tham chiếu sau ${MEDIA_ORPHAN_CLEANUP.RETENTION_HOURS} giờ`,
          });
          await this.storage.deleteImage(orphan.publicId);
          report.deleted += 1;
        } catch (error) {
          report.failed.push({ publicId: orphan.publicId, error: error instanceof Error ? error.message : String(error) });
        }
      }
    }
    this.logger.log({ mode, scanned: report.scanned, candidates: report.candidates, deleted: report.deleted, failed: report.failed.length }, 'media orphan cleanup finished');
    return report;
  }

  /** Public id nào trong danh sách đang được nghiệp vụ tham chiếu (đọc chỉ-đọc từ các bảng sở hữu ảnh). */
  private async referencedPublicIds(publicIds: string[]): Promise<Set<string>> {
    if (publicIds.length === 0) return new Set();
    const rows = await this.prisma.$queryRaw<Array<{ public_id: string }>>`
      SELECT public_id FROM media_assets WHERE public_id = ANY(${publicIds})
      UNION
      SELECT e->>'publicId' FROM return_requests r, jsonb_array_elements(COALESCE(r.evidence_images, '[]'::jsonb)) e
        WHERE e->>'publicId' = ANY(${publicIds})
      UNION
      SELECT e->>'publicId' FROM refunds f, jsonb_array_elements(COALESCE(f.proof_images, '[]'::jsonb)) e
        WHERE e->>'publicId' = ANY(${publicIds})`;
    return new Set(rows.map(({ public_id }) => public_id));
  }
}
