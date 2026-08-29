import { Module } from '@nestjs/common';
import { DisabledObjectStorageClient } from './disabled-object-storage.client';
import { ObjectStorageClient } from './object-storage.client';

@Module({
  providers: [{ provide: ObjectStorageClient, useClass: DisabledObjectStorageClient }],
  exports: [ObjectStorageClient],
})
export class ObjectStorageModule {}
