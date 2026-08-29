import { BadRequestException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import {
  CreateSignedImageUploadInput,
  ObjectStorageClient,
  SignedImageUploadResult,
  StoredImageAsset,
  VerifyImageUploadInput,
} from './object-storage.client';

interface CloudinaryObjectStorageOptions {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  folder: string;
  allowedFormats: string[];
  maxBytes: number;
}

interface CloudinaryResource {
  asset_id: string;
  public_id: string;
  format: string;
  version: number;
  resource_type: string;
  bytes: number;
  width: number;
  height: number;
  secure_url: string;
}

export class CloudinaryObjectStorageClient extends ObjectStorageClient {
  constructor(private readonly options: CloudinaryObjectStorageOptions) {
    super();
    cloudinary.config({
      cloud_name: options.cloudName,
      api_key: options.apiKey,
      api_secret: options.apiSecret,
      secure: true,
    });
  }

  createSignedImageUpload(
    input: CreateSignedImageUploadInput,
  ): Promise<SignedImageUploadResult> {
    if (!input.contentType.startsWith('image/') || input.sizeBytes > this.options.maxBytes) {
      return Promise.reject(new BadRequestException('Image type or size is not allowed'));
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const params = {
      allowed_formats: this.options.allowedFormats.join(','),
      folder: input.folder,
      overwrite: false,
      public_id: input.publicId,
      timestamp,
      unique_filename: false,
    };

    return Promise.resolve({
      provider: 'CLOUDINARY',
      uploadUrl: `https://api.cloudinary.com/v1_1/${encodeURIComponent(this.options.cloudName)}/image/upload`,
      cloudName: this.options.cloudName,
      apiKey: this.options.apiKey,
      timestamp,
      signature: cloudinary.utils.api_sign_request(params, this.options.apiSecret),
      folder: input.folder,
      publicId: input.publicId,
      allowedFormats: [...this.options.allowedFormats],
      maxBytes: this.options.maxBytes,
      overwrite: false,
      uniqueFilename: false,
      expiresAt: new Date((timestamp + input.expiresInSeconds) * 1000).toISOString(),
    });
  }

  async verifyImageUpload(input: VerifyImageUploadInput): Promise<StoredImageAsset> {
    this.assertUploadResponseSignature(input);

    const resource = (await cloudinary.api.resource(input.publicId, {
      resource_type: 'image',
      type: 'upload',
    })) as CloudinaryResource;

    const expectedPrefix = `${this.options.folder}/`;
    const isAllowed =
      resource.resource_type === 'image' &&
      resource.public_id.startsWith(expectedPrefix) &&
      resource.version === input.version &&
      resource.bytes <= this.options.maxBytes &&
      this.options.allowedFormats.includes(resource.format);

    if (!isAllowed) {
      await cloudinary.uploader.destroy(resource.public_id, {
        invalidate: true,
        resource_type: 'image',
      });
      throw new BadRequestException('Uploaded image failed provider verification');
    }

    const mimeFormat = resource.format === 'jpg' ? 'jpeg' : resource.format;
    return {
      provider: 'CLOUDINARY',
      providerAssetId: resource.asset_id,
      publicId: resource.public_id,
      secureUrl: resource.secure_url,
      thumbnailUrl: cloudinary.url(resource.public_id, {
        secure: true,
        width: 320,
        height: 320,
        crop: 'limit',
        quality: 'auto',
        fetch_format: 'auto',
      }),
      mimeType: `image/${mimeFormat}`,
      width: resource.width,
      height: resource.height,
      sizeBytes: resource.bytes,
      format: resource.format,
      version: resource.version,
    };
  }

  async deleteImage(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId, {
      invalidate: true,
      resource_type: 'image',
    });
  }

  private assertUploadResponseSignature(input: VerifyImageUploadInput): void {
    const expected = cloudinary.utils.api_sign_request(
      { public_id: input.publicId, version: input.version },
      this.options.apiSecret,
    );
    const expectedHash = createHash('sha256').update(expected).digest();
    const receivedHash = createHash('sha256').update(input.signature).digest();
    if (!timingSafeEqual(expectedHash, receivedHash)) {
      throw new BadRequestException('Cloudinary upload signature is invalid');
    }
  }
}
