import { Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditWriter, PrismaAuditWriter } from './audit.writer';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

@Module({
  providers: [
    AuditService,
    {
      provide: AuditWriter,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaAuditWriter(prisma),
    },
  ],
  controllers: [AuditController],
  exports: [AuditWriter],
})
export class AuditModule {}
