import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { ObjectStorageClient } from '../../integrations/object-storage/object-storage.client';
import {
  CreateMediaUploadDto,
  FinalizeMediaUploadDto,
  MediaAssetDto,
  SignedMediaUploadDto,
} from './media.dto';

@Injectable()
export class MediaService {
  constructor(
    private readonly objectStorage: ObjectStorageClient,
    private readonly config: ConfigService,
  ) {}

  createUpload(input: CreateMediaUploadDto): Promise<SignedMediaUploadDto> {
    const folder = this.config.get<string>('cloudinary.folder') ?? 'sport-sys/sport';
    return this.objectStorage.createSignedImageUpload({
      publicId: randomUUID(),
      folder,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      expiresInSeconds: 60 * 60,
    });
  }

  finalizeUpload(input: FinalizeMediaUploadDto): Promise<MediaAssetDto> {
    return this.objectStorage.verifyImageUpload(input);
  }
}
