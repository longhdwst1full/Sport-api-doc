import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  CreateSignedImageUploadInput,
  ObjectStorageClient,
  SignedImageUploadResult,
  StoredImageAsset,
  VerifyImageUploadInput,
} from './object-storage.client';

@Injectable()
export class DisabledObjectStorageClient extends ObjectStorageClient {
  createSignedImageUpload(input: CreateSignedImageUploadInput): Promise<SignedImageUploadResult> {
    void input;
    throw new ServiceUnavailableException('Object storage provider is not configured');
  }

  verifyImageUpload(input: VerifyImageUploadInput): Promise<StoredImageAsset> {
    void input;
    throw new ServiceUnavailableException('Object storage provider is not configured');
  }

  deleteImage(publicId: string): Promise<void> {
    void publicId;
    throw new ServiceUnavailableException('Object storage provider is not configured');
  }
}
