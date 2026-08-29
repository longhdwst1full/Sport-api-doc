import { Module } from '@nestjs/common';
import { OrganizationModule } from '../organization/organization.module';
import { IamController } from './iam.controller';
import { IamRepository } from './iam.repository';
import { IamService } from './iam.service';
import { InMemoryIamRepository } from './in-memory-iam.repository';

@Module({
  imports: [OrganizationModule],
  controllers: [IamController],
  providers: [{ provide: IamRepository, useClass: InMemoryIamRepository }, IamService],
})
export class IamModule {}
