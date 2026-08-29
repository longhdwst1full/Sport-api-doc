export interface CreateSignedImageUploadInput {
  publicId: string;
  folder: string;
  contentType: string;
  sizeBytes: number;
  expiresInSeconds: number;
}

export interface SignedImageUploadResult {
  provider: 'CLOUDINARY';
  uploadUrl: string;
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  publicId: string;
  allowedFormats: string[];
  maxBytes: number;
  overwrite: false;
  uniqueFilename: false;
  expiresAt: string;
}

export interface VerifyImageUploadInput {
  publicId: string;
  version: number;
  signature: string;
}

export interface StoredImageAsset {
  provider: 'CLOUDINARY';
  providerAssetId: string;
  publicId: string;
  secureUrl: string;
  thumbnailUrl: string;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
  format: string;
  version: number;
}

export abstract class ObjectStorageClient {
  abstract createSignedImageUpload(
    input: CreateSignedImageUploadInput,
  ): Promise<SignedImageUploadResult>;
  abstract verifyImageUpload(input: VerifyImageUploadInput): Promise<StoredImageAsset>;
  abstract deleteImage(publicId: string): Promise<void>;
}
