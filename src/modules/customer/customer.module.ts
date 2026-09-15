import { Module } from '@nestjs/common';
import { AdminCustomerController } from './admin-customer.controller';
import { AdminCustomerService } from './admin-customer.service';
import { CustomerAddressController } from './customer-address.controller';
import { CustomerAddressService } from './customer-address.service';
import { CustomerProfileController } from './customer-profile.controller';
import { CustomerProfileService } from './customer-profile.service';

@Module({
  controllers: [CustomerAddressController, CustomerProfileController, AdminCustomerController],
  providers: [CustomerAddressService, CustomerProfileService, AdminCustomerService],
  exports: [CustomerAddressService],
})
export class CustomerModule {}
