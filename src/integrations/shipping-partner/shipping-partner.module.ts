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
        const fromDistrictId = config.get<string>('app.shipping.ghn.fromDistrictId');
        const fromWardCode = config.get<string>('app.shipping.ghn.fromWardCode');
        // Thiếu bất kỳ mảnh nào thì tạo vận đơn tự động phải tắt hẳn, không đoán giá trị mặc định:
        // sai điểm lấy hàng nghĩa là shipper tới nhầm địa chỉ.
        if (!enabled || !token || !shopId || !fromDistrictId || !fromWardCode) {
          return new DisabledShippingPartnerClient();
        }

        return new GhnShippingPartnerClient({
          baseUrl: config.getOrThrow<string>('app.shipping.ghn.baseUrl'),
          token,
          shopId,
          fromDistrictId: Number(fromDistrictId),
          fromWardCode,
          serviceTypeId: config.get<number>('app.shipping.ghn.serviceTypeId') ?? 2,
          timeoutMs: config.get<number>('app.shipping.providerTimeoutMs') ?? 5_000,
        });
      },
    },
  ],
  exports: [ShippingPartnerClient],
})
export class ShippingPartnerModule {}
