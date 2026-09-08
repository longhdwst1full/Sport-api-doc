import { Module } from '@nestjs/common';
import { SystemController } from './system.controller';
import { SystemSettingService } from './system-setting.service';
import { SystemService } from './system.service';

@Module({
  controllers: [SystemController],
  providers: [SystemService, SystemSettingService],
  exports: [SystemSettingService],
})
export class SystemModule {}
