import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../../database/prisma.service';
import type { ObjectStorageClient, StoredImageListItem } from '../../../integrations/object-storage/object-storage.client';
import type { AuditWriter } from '../../audit/audit.writer';
import { MEDIA_ORPHAN_CLEANUP, MediaOrphanCleanupService } from './media-orphan-cleanup.service';

const now = new Date('2026-09-25T12:00:00.000Z');
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);
const root = 'sport-sys/sport';

function build(byFolder: Record<string, StoredImageListItem[]>, referenced: string[] = []) {
  const listImages = jest.fn((prefix: string) => {
    const folder = prefix.slice(root.length + 1, -1);
    return Promise.resolve({ items: byFolder[folder] ?? [] });
  });
  const deleteImage = jest.fn().mockResolvedValue(undefined);
  const write = jest.fn().mockResolvedValue(undefined);
  const queryRaw = jest.fn((_strings: TemplateStringsArray, ids: string[]) =>
    Promise.resolve(ids.filter((id) => referenced.includes(id)).map((id) => ({ public_id: id }))));
  const service = new MediaOrphanCleanupService(
    { $queryRaw: queryRaw } as unknown as PrismaService,
    { listImages, deleteImage } as unknown as ObjectStorageClient,
    { write } as unknown as AuditWriter,
    { get: jest.fn().mockReturnValue(root) } as unknown as ConfigService,
  );
  return { service, listImages, deleteImage, write };
}

const image = (folder: string, name: string, ageHours: number): StoredImageListItem => ({
  publicId: `${root}/${folder}/${name}`,
  createdAt: hoursAgo(ageHours),
  sizeBytes: 1000,
});

describe('MediaOrphanCleanupService', () => {
  it('scans only the three evidence folders', async () => {
    const { service, listImages } = build({});

    await service.run('DRY_RUN', 'r1', now);

    expect(listImages.mock.calls.map(([prefix]) => prefix)).toEqual(
      MEDIA_ORPHAN_CLEANUP.FOLDERS.map((folder) => `${root}/${folder}/`),
    );
  });

  it('reports only images older than 24h that nothing references, and deletes nothing in dry-run', async () => {
    const { service, deleteImage, write } = build({
      'return-evidence': [image('return-evidence', 'o1/used', 48), image('return-evidence', 'o1/orphan', 30), image('return-evidence', 'o2/fresh', 2)],
      'payment-evidence': [image('payment-evidence', 'PAY-1/asset', 100)],
    }, [`${root}/return-evidence/o1/used`, `${root}/payment-evidence/PAY-1/asset`]);

    const report = await service.run('DRY_RUN', 'r2', now);

    expect(report).toMatchObject({ mode: 'DRY_RUN', scanned: 4, referenced: 2, tooRecent: 1, candidates: 1, deleted: 0 });
    expect(report.items).toEqual([expect.objectContaining({ publicId: `${root}/return-evidence/o1/orphan`, folder: 'return-evidence', ageHours: 30 })]);
    expect(deleteImage).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it('deletes at most 100 orphans per run and audits each one before calling the provider', async () => {
    const images = Array.from({ length: 130 }, (_, index) => image('refund-proof', `r${index}`, 40));
    const { service, deleteImage, write } = build({ 'refund-proof': images });

    const report = await service.run('DELETE', 'r3', now);

    expect(report.candidates).toBe(130);
    expect(report.deleted).toBe(MEDIA_ORPHAN_CLEANUP.MAX_DELETE_PER_RUN);
    expect(deleteImage).toHaveBeenCalledTimes(100);
    expect(write).toHaveBeenCalledTimes(100);
    expect(write.mock.invocationCallOrder[0]).toBeLessThan(deleteImage.mock.invocationCallOrder[0]);
  });

  it('keeps going and reports a provider failure instead of aborting the batch', async () => {
    const { service, deleteImage } = build({ 'refund-proof': [image('refund-proof', 'a', 40), image('refund-proof', 'b', 40)] });
    deleteImage.mockRejectedValueOnce(new Error('rate limited'));

    const report = await service.run('DELETE', 'r4', now);

    expect(report.deleted).toBe(1);
    expect(report.failed).toEqual([{ publicId: `${root}/refund-proof/a`, error: 'rate limited' }]);
  });
});
