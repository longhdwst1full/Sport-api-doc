import { Module } from '@nestjs/common';
import { ReportExportService } from './report-export.service';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';

@Module({
  controllers: [ReportingController],
  providers: [ReportingService, ReportExportService],
  exports: [ReportingService],
})
export class ReportingModule {}
