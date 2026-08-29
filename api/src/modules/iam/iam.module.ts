import { Module } from '@nestjs/common';
import { OrganizationModule } from '../organization/organization.module';
import { AuditModule } from '../audit/audit.module';
import { IamController } from './iam.controller';
import { IamRepository } from './iam.repository';
import { IamService } from './iam.service';
import { PrismaIamRepository } from './prisma-iam.repository';

@Module({
  imports: [OrganizationModule, AuditModule],
  controllers: [IamController],
  providers: [{ provide: IamRepository, useClass: PrismaIamRepository }, IamService],
})
export class IamModule {}
