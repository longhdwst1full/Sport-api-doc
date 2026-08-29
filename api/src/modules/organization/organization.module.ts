import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OrganizationController } from './organization.controller';
import { OrganizationRepository } from './organization.repository';
import { OrganizationService } from './organization.service';
import { PrismaOrganizationRepository } from './prisma-organization.repository';

@Module({
  imports: [AuditModule],
  controllers: [OrganizationController],
  providers: [
    { provide: OrganizationRepository, useClass: PrismaOrganizationRepository },
    OrganizationService,
  ],
  exports: [OrganizationService],
})
export class OrganizationModule {}
