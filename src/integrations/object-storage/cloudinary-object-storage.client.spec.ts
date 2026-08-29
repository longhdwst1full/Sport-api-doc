import { BadRequestException } from '@nestjs/common';
import { CloudinaryObjectStorageClient } from './cloudinary-object-storage.client';

describe('CloudinaryObjectStorageClient', () => {
  const createClient = () =>
    new CloudinaryObjectStorageClient({
      cloudName: 'sport-cloud',
      apiKey: 'public-key',
      apiSecret: 'private-secret',
      folder: 'sport-sys/sport',
      allowedFormats: ['jpg', 'png', 'webp'],
      maxBytes: 10 * 1024 * 1024,
    });

  it('creates a signed direct-upload request without exposing the API secret', async () => {
    const result = await createClient().createSignedImageUpload({
      publicId: 'asset-id',
      folder: 'sport-sys/sport',
      contentType: 'image/webp',
      sizeBytes: 1024,
      expiresInSeconds: 600,
    });

    expect(result.uploadUrl).toBe('https://api.cloudinary.com/v1_1/sport-cloud/image/upload');
    expect(result.signature).toBeTruthy();
    expect(result.folder).toBe('sport-sys/sport');
    expect(result).not.toHaveProperty('apiSecret');
  });

  it('rejects an oversized image before issuing a signature', async () => {
    await expect(
      createClient().createSignedImageUpload({
        publicId: 'asset-id',
        folder: 'sport-sys/sport',
        contentType: 'image/png',
        sizeBytes: 11 * 1024 * 1024,
        expiresInSeconds: 600,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a forged upload response before calling the Admin API', async () => {
    await expect(
      createClient().verifyImageUpload({
        publicId: 'sport-sys/sport/asset-id',
        version: 1,
        signature: 'forged',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
