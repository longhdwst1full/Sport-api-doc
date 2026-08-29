import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

import { CatalogModule } from './modules/catalog/catalog.module';
import { ApprovalModule } from './modules/approval/approval.module';
import { CartModule } from './modules/cart/cart.module';
import { CmsModule } from './modules/cms/cms.module';
import { CustomerModule } from './modules/customer/customer.module';
import { FulfillmentModule } from './modules/fulfillment/fulfillment.module';
import { HealthModule } from './modules/health/health.module';
import { IamModule } from './modules/iam/iam.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { MediaModule } from './modules/media/media.module';
import { NotificationModule } from './modules/notification/notification.module';
import { OrderModule } from './modules/order/order.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { PaymentModule } from './modules/payment/payment.module';
import { PlatformModule } from './modules/platform/platform.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { PromotionModule } from './modules/promotion/promotion.module';
import { ReturnModule } from './modules/return/return.module';
import { ReviewModule } from './modules/review/review.module';
import { ShippingModule } from './modules/shipping/shipping.module';
import { SystemModule } from './modules/system/system.module';
import { PermissionGuard } from './platform/auth/permission.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    HealthModule,
    SystemModule,
    OrganizationModule,
    IamModule,
    ApprovalModule,
    CustomerModule,
    CatalogModule,
    InventoryModule,
    PricingModule,
    PromotionModule,
    CartModule,
    CmsModule,
    OrderModule,
    PaymentModule,
    FulfillmentModule,
    ShippingModule,
    ReturnModule,
    ReviewModule,
    NotificationModule,
    MediaModule,
    PlatformModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: PermissionGuard }],
})
export class AppModule {}
