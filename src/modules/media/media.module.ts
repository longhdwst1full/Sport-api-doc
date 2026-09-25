import { Module } from '@nestjs/common';
import { ObjectStorageModule } from '../../integrations/object-storage/object-storage.module';
import { AuditModule } from '../audit/audit.module';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { MediaOrphanCleanupController } from './orphan-cleanup/media-orphan-cleanup.controller';
import { MediaOrphanCleanupService } from './orphan-cleanup/media-orphan-cleanup.service';

@Module({
  imports: [ObjectStorageModule, AuditModule],
  controllers: [MediaController, MediaOrphanCleanupController],
  providers: [MediaService, MediaOrphanCleanupService],
  exports: [MediaService],
})
export class MediaModule {}
