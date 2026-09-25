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

export interface StoredImageListItem {
  publicId: string;
  createdAt: Date;
  sizeBytes: number;
}

export interface StoredImagePage {
  items: StoredImageListItem[];
  nextCursor?: string;
}

export abstract class ObjectStorageClient {
  abstract createSignedImageUpload(
    input: CreateSignedImageUploadInput,
  ): Promise<SignedImageUploadResult>;
  abstract verifyImageUpload(input: VerifyImageUploadInput): Promise<StoredImageAsset>;
  abstract deleteImage(publicId: string): Promise<void>;
  /** Liệt kê ảnh theo tiền tố public id (chỉ đọc), phân trang bằng cursor của provider. */
  abstract listImages(prefix: string, cursor?: string): Promise<StoredImagePage>;
}
