import { Module } from '@nestjs/common';
import { AdminCustomerController } from './admin-customer.controller';
import { AdminCustomerService } from './admin-customer.service';
import { CustomerAddressController } from './customer-address.controller';
import { CustomerAddressService } from './customer-address.service';

@Module({
  controllers: [CustomerAddressController, AdminCustomerController],
  providers: [CustomerAddressService, AdminCustomerService],
  exports: [CustomerAddressService],
})
export class CustomerModule {}
