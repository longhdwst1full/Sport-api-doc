import { Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditWriter, PrismaAuditWriter } from './audit.writer';

@Module({
  providers: [
    {
      provide: AuditWriter,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaAuditWriter(prisma),
    },
  ],
  exports: [AuditWriter],
})
export class AuditModule {}
