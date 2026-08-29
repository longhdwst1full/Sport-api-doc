import { Module } from '@nestjs/common';
import { ObjectStorageModule } from '../../integrations/object-storage/object-storage.module';

@Module({
  imports: [ObjectStorageModule],
  exports: [ObjectStorageModule],
})
export class MediaModule {}
