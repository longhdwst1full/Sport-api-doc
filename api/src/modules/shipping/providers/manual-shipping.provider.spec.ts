import { ManualShippingProvider } from './manual-shipping.provider';

describe('ManualShippingProvider', () => {
  it('creates an internal tracking reference without calling a partner', async () => {
    await expect(new ManualShippingProvider().createShipment({ orderId: 'ORDER-001' })).resolves.toEqual(
      {
        provider: 'MANUAL',
        trackingCode: 'MANUAL-ORDER-001',
      },
    );
  });
});
