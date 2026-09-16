import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DisabledShippingPartnerClient } from './disabled-shipping-partner.client';
import { GhnShippingPartnerClient } from './ghn-shipping-partner.client';
import { ShippingPartnerClient } from './shipping-partner.client';

@Module({
  providers: [
    {
      provide: ShippingPartnerClient,
      inject: [ConfigService],
      useFactory: (config: ConfigService): ShippingPartnerClient => {
        const enabled = config.get<boolean>('app.shipping.ghn.enabled') === true;
        const token = config.get<string>('app.shipping.ghn.token');
        const shopId = config.get<string>('app.shipping.ghn.shopId');
        // Điểm lấy hàng không nằm ở đây: nó là địa chỉ của chi nhánh xuất đơn và đi kèm từng
        // vận đơn. Ở tầng cấu hình chỉ cần đủ thông tin để nói chuyện được với GHN.
        if (!enabled || !token || !shopId) {
          return new DisabledShippingPartnerClient();
        }

        return new GhnShippingPartnerClient({
          baseUrl: config.getOrThrow<string>('app.shipping.ghn.baseUrl'),
          token,
          shopId,
          serviceTypeId: config.get<number>('app.shipping.ghn.serviceTypeId') ?? 2,
          timeoutMs: config.get<number>('app.shipping.providerTimeoutMs') ?? 5_000,
        });
      },
    },
  ],
  exports: [ShippingPartnerClient],
})
export class ShippingPartnerModule {}
