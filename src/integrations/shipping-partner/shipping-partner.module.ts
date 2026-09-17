import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationConfigService } from '../../modules/system/parameters/integration-config.service';
import { SystemModule } from '../../modules/system/system.module';
import { DisabledShippingPartnerClient } from './disabled-shipping-partner.client';
import { GhnShippingPartnerClient } from './ghn-shipping-partner.client';
import { ShippingPartnerClient } from './shipping-partner.client';

@Module({
  imports: [SystemModule],
  providers: [
    {
      provide: ShippingPartnerClient,
      inject: [ConfigService, IntegrationConfigService],
      useFactory: (
        config: ConfigService,
        integrations: IntegrationConfigService,
      ): ShippingPartnerClient =>
        // Cấu hình đọc tại thời điểm gọi hãng: bật GHN hoặc xoay token ở màn Admin phải có hiệu
        // lực ngay. Thiếu cấu hình thì resolver trả undefined và adapter ném 503 rõ ràng.
        new GhnShippingPartnerClient(async () => {
          const ghn = await integrations.ghn();
          if (!ghn.enabled || !ghn.token || !ghn.shopId) return undefined;
          return {
            baseUrl: ghn.baseUrl,
            token: ghn.token,
            shopId: ghn.shopId,
            serviceTypeId: ghn.serviceTypeId,
            timeoutMs: config.get<number>('app.shipping.providerTimeoutMs') ?? 5_000,
          };
        }),
    },
  ],
  exports: [ShippingPartnerClient],
})
export class ShippingPartnerModule {}

// Giữ export để nơi nào cần một client chắc chắn tắt vẫn dùng được (ví dụ integration test).
export { DisabledShippingPartnerClient };
