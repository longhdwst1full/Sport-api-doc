import { Module } from '@nestjs/common';
import { ObjectStorageModule } from '../../integrations/object-storage/object-storage.module';
import { AuditModule } from '../audit/audit.module';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

@Module({
  imports: [ObjectStorageModule, AuditModule],
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
