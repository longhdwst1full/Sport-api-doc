export interface CreateUploadUrlInput {
  objectKey: string;
  contentType: string;
  expiresInSeconds: number;
}

export interface UploadUrlResult {
  uploadUrl: string;
  publicUrl?: string;
  expiresAt: string;
}

export abstract class ObjectStorageClient {
  abstract createUploadUrl(input: CreateUploadUrlInput): Promise<UploadUrlResult>;
  abstract deleteObject(objectKey: string): Promise<void>;
}
