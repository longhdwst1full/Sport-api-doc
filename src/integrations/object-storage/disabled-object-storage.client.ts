import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  CreateUploadUrlInput,
  ObjectStorageClient,
  UploadUrlResult,
} from './object-storage.client';

@Injectable()
export class DisabledObjectStorageClient extends ObjectStorageClient {
  createUploadUrl(input: CreateUploadUrlInput): Promise<UploadUrlResult> {
    void input;
    throw new ServiceUnavailableException('Object storage provider is not configured');
  }

  deleteObject(objectKey: string): Promise<void> {
    void objectKey;
    throw new ServiceUnavailableException('Object storage provider is not configured');
  }
}
