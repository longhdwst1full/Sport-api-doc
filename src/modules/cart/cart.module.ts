import { Module } from '@nestjs/common';
import { AccountCartController, GuestCartController } from './cart.controller';
import { CartService } from './cart.service';

@Module({
  controllers: [GuestCartController, AccountCartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
