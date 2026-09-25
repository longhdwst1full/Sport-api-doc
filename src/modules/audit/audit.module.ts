import { Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditReader } from './audit.reader';
import { AuditWriter, PrismaAuditWriter } from './audit.writer';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

@Module({
  providers: [
    AuditService,
    AuditReader,
    {
      provide: AuditWriter,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaAuditWriter(prisma),
    },
  ],
  controllers: [AuditController],
  exports: [AuditWriter, AuditReader],
})
export class AuditModule {}
