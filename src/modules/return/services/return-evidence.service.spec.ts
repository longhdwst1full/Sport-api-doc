import type { ConfigService } from '@nestjs/config';
import type { ObjectStorageClient } from '../../../integrations/object-storage/object-storage.client';
import { RETURN_ERROR_CODE } from '../return.constants';
import { ReturnEvidenceService } from './return-evidence.service';

function build() {
  const storage = {
    createSignedImageUpload: jest.fn().mockResolvedValue({ publicId: 'generated' }),
    verifyImageUpload: jest.fn((input: { publicId: string }) => Promise.resolve({
      provider: 'CLOUDINARY',
      providerAssetId: 'asset',
      publicId: input.publicId,
      secureUrl: `https://res.cloudinary.com/${input.publicId}.jpg`,
      thumbnailUrl: `https://res.cloudinary.com/${input.publicId}-thumb.jpg`,
      mimeType: 'image/jpeg',
      width: 800,
      height: 600,
      sizeBytes: 120_000,
      format: 'jpg',
      version: 1,
    })),
  };
  const config = { get: jest.fn().mockReturnValue('shop') } as unknown as ConfigService;
  return { service: new ReturnEvidenceService(storage as unknown as ObjectStorageClient, config), storage };
}

const uploader = { type: 'CUSTOMER' as const, userId: '5' };
const image = (publicId: string) => ({ publicId, providerVersion: 1, providerSignature: 'sig' });

function codeOf(error: unknown): string | undefined {
  return ((error as { getResponse: () => { code?: string } }).getResponse()).code;
}

describe('ReturnEvidenceService', () => {
  it('signs uploads into the folder of the order or of the refund proof', async () => {
    const { service, storage } = build();
    await service.createUpload({ kind: 'ORDER', orderId: 9n }, { fileName: 'a.jpg', contentType: 'image/jpeg', sizeBytes: 1000 });
    await service.createUpload({ kind: 'REFUND_PROOF', returnId: 4n }, { fileName: 'b.jpg', contentType: 'image/jpeg', sizeBytes: 1000 });
    const folders = (storage.createSignedImageUpload.mock.calls as [{ folder: string }][]).map((call) => call[0].folder);
    expect(folders).toEqual(['shop/return-evidence/o9', 'shop/refund-proof/r4']);
  });

  it('stores verified images with who uploaded them', async () => {
    const { service } = build();
    const [stored] = await service.verify({ kind: 'ORDER', orderId: 9n }, [image('shop/return-evidence/o9/abc')], uploader);
    expect(stored).toEqual(expect.objectContaining({
      publicId: 'shop/return-evidence/o9/abc',
      url: 'https://res.cloudinary.com/shop/return-evidence/o9/abc.jpg',
      width: 800,
      uploaderType: 'CUSTOMER',
      uploadedBy: '5',
    }));
  });

  it('rejects an image of another order before asking the provider', async () => {
    const { service, storage } = build();
    const error = await service
      .verify({ kind: 'ORDER', orderId: 9n }, [image('shop/return-evidence/o10/abc')], uploader)
      .catch((caught: unknown) => caught);
    expect(codeOf(error)).toBe(RETURN_ERROR_CODE.EVIDENCE_INVALID);
    expect(storage.verifyImageUpload).not.toHaveBeenCalled();
  });

  it('rejects a product image from the shop root folder', async () => {
    const { service } = build();
    const error = await service
      .verify({ kind: 'ORDER', orderId: 9n }, [image('shop/products/racket')], uploader)
      .catch((caught: unknown) => caught);
    expect(codeOf(error)).toBe(RETURN_ERROR_CODE.EVIDENCE_INVALID);
  });

  it('rejects the same image twice', async () => {
    const { service } = build();
    const same = image('shop/refund-proof/r4/receipt');
    const error = await service
      .verify({ kind: 'REFUND_PROOF', returnId: 4n }, [same, same], { type: 'USER', userId: '10' })
      .catch((caught: unknown) => caught);
    expect(codeOf(error)).toBe(RETURN_ERROR_CODE.EVIDENCE_INVALID);
  });
});
