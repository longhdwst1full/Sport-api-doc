import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CloudinaryObjectStorageClient } from './cloudinary-object-storage.client';
import { DisabledObjectStorageClient } from './disabled-object-storage.client';
import { ObjectStorageClient } from './object-storage.client';

@Module({
  providers: [
    {
      provide: ObjectStorageClient,
      inject: [ConfigService],
      useFactory: (config: ConfigService): ObjectStorageClient => {
        const cloudName = config.get<string>('cloudinary.cloudName');
        const apiKey = config.get<string>('cloudinary.apiKey');
        const apiSecret = config.get<string>('cloudinary.apiSecret');
        if (!cloudName || !apiKey || !apiSecret) return new DisabledObjectStorageClient();

        return new CloudinaryObjectStorageClient({
          cloudName,
          apiKey,
          apiSecret,
          folder: config.get<string>('cloudinary.folder') ?? 'sport-sys/sport',
          allowedFormats: config.get<string[]>('cloudinary.allowedImageFormats') ?? [
            'jpg',
            'jpeg',
            'png',
            'webp',
            'avif',
          ],
          maxBytes: config.get<number>('cloudinary.maxImageBytes') ?? 10 * 1024 * 1024,
        });
      },
    },
  ],
  exports: [ObjectStorageClient],
})
export class ObjectStorageModule {}
