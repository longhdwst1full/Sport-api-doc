import { Module, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';

import { PermissionGuard } from './common/guards/permission.guard';
import appConfig from './config/app.config';
import cloudinaryConfig from './config/cloudinary.config';
import databaseConfig from './config/database.config';
import { validateEnvironment } from './config/env.validation';
import { PrismaModule } from './database/prisma.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { ApprovalModule } from './modules/approval/approval.module';
import { AuditModule } from './modules/audit/audit.module';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env.local', '.env'],
      load: [appConfig, databaseConfig, cloudinaryConfig],
      validate: validateEnvironment,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        forRoutes: [{ path: '{*path}', method: RequestMethod.ALL }],
        pinoHttp: {
          level: config.get<string>('app.logLevel') ?? 'info',
          genReqId: (request, response) => {
            const incoming = request.headers['x-request-id'];
            const requestId =
              typeof incoming === 'string' && incoming.trim() ? incoming : randomUUID();
            response.setHeader('x-request-id', requestId);
            return requestId;
          },
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'res.headers.set-cookie',
              'req.body.password',
              'req.body.refreshToken',
            ],
            censor: '[REDACTED]',
          },
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          name: 'default',
          ttl: config.get<number>('app.rateLimit.ttlMs') ?? 60_000,
          limit: config.get<number>('app.rateLimit.max') ?? 120,
        },
      ],
    }),
    PrismaModule,
    HealthModule,
    SystemModule,
    OrganizationModule,
    IamModule,
    ApprovalModule,
    AuditModule,
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
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
})
export class AppModule {}
