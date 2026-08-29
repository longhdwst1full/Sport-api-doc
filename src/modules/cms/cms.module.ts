import { Module } from '@nestjs/common';
import { AdminContentController, PublicContentController } from './cms.controller';
import { CmsService } from './cms.service';

@Module({ controllers: [PublicContentController, AdminContentController], providers: [CmsService] })
export class CmsModule {}
