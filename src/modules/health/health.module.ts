import { Module } from '@nestjs/common';
import { SystemModule } from '../system/system.module';
import { ConfigReadinessService } from './config-readiness.service';
import { HealthController } from './health.controller';

@Module({
  imports: [SystemModule],
  controllers: [HealthController],
  providers: [ConfigReadinessService],
})
export class HealthModule {}
