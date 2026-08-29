import { Module } from '@nestjs/common';
import { InMemoryOrganizationRepository } from './in-memory-organization.repository';
import { OrganizationController } from './organization.controller';
import { OrganizationRepository } from './organization.repository';
import { OrganizationService } from './organization.service';

@Module({
  controllers: [OrganizationController],
  providers: [
    { provide: OrganizationRepository, useClass: InMemoryOrganizationRepository },
    OrganizationService,
  ],
  exports: [OrganizationService],
})
export class OrganizationModule {}
