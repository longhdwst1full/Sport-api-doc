import { Module } from '@nestjs/common';
import { OrganizationModule } from '../organization/organization.module';
import { IamController } from './iam.controller';
import { IamService } from './iam.service';

@Module({
  imports: [OrganizationModule],
  controllers: [IamController],
  providers: [IamService],
})
export class IamModule {}
