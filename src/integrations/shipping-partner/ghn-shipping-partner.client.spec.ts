import { ServiceUnavailableException } from '@nestjs/common';
import { GhnShippingPartnerClient } from './ghn-shipping-partner.client';

const options = {
  baseUrl: 'https://dev-online-gateway.ghn.vn/shiip/public-api',
  token: 'ghn-token',
  shopId: '123456',
  serviceTypeId: 2,
  timeoutMs: 5_000,
};

const validInput = {
  orderId: '9',
  // Điểm lấy hàng đi kèm từng vận đơn vì mỗi chi nhánh giao từ địa chỉ của chính nó.
  pickup: { districtCode: '1442', wardCode: '21012' },
  orderNo: 'DH-0009',
  recipientName: 'Nguyễn Văn A',
  recipientPhone: '0912345678',
  addressLine: '12 Nguyễn Trãi',
  provinceCode: '201',
  districtCode: '1489',
  wardCode: '1A0607',
  weightGrams: 1_200,
};

/** Đọc body JSON của lần gọi fetch thứ `index`. */
function sentBody(fetchMock: jest.Mock, index = 0): Record<string, unknown> {
  const init = (fetchMock.mock.calls[index] as [string, RequestInit])[1];
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

function mockFetch(payload: unknown, ok = true, status = 200): jest.Mock {
  const fetchMock = jest.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(payload),
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('GhnShippingPartnerClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates a shipment and returns the GHN tracking code', async () => {
    const fetchMock = mockFetch({
      code: 200,
      data: { order_code: 'LXQ7A9', total_fee: 32_000, expected_delivery_time: '2026-09-18T10:00:00Z' },
    });
    const client = new GhnShippingPartnerClient(options);

    const result = await client.createShipment({ ...validInput, codAmount: 450_000 });

    expect(result).toEqual({
      provider: 'GHN',
      trackingCode: 'LXQ7A9',
      fee: 32_000,
      expectedDeliveryAt: '2026-09-18T10:00:00Z',
    });
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${options.baseUrl}/v2/shipping-order/create`);
    const body = sentBody(fetchMock);
    // COD > 0 phải là payment_type_id = 2 (người nhận trả), nếu không GHN thu tiền sai phía.
    expect(body.payment_type_id).toBe(2);
    expect(body.cod_amount).toBe(450_000);
    expect(body.to_district_id).toBe(1489);
    expect(body.from_district_id).toBe(1442);
    expect(body.from_ward_code).toBe('21012');
  });

  it('marks a prepaid order as sender-paid', async () => {
    const fetchMock = mockFetch({ code: 200, data: { order_code: 'LXQ7A9' } });
    const client = new GhnShippingPartnerClient(options);

    await client.createShipment(validInput);

    const body = sentBody(fetchMock);
    expect(body.payment_type_id).toBe(1);
    expect(body.cod_amount).toBe(0);
  });

  it('caps the declared value at the GHN insurance ceiling', async () => {
    const fetchMock = mockFetch({ code: 200, data: { order_code: 'LXQ7A9' } });
    const client = new GhnShippingPartnerClient(options);

    await client.createShipment({ ...validInput, declaredValue: 50_000_000 });

    const body = sentBody(fetchMock);
    expect(body.insurance_value).toBe(2_200_000);
  });

  it('refuses a branch without GHN district and ward codes', async () => {
    const fetchMock = mockFetch({ code: 200, data: { order_code: 'LXQ7A9' } });
    const client = new GhnShippingPartnerClient(options);

    await expect(
      client.createShipment({ ...validInput, pickup: { districtCode: '', wardCode: '' } }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a recipient address without GHN district and ward codes', async () => {
    const fetchMock = mockFetch({ code: 200, data: { order_code: 'LXQ7A9' } });
    const client = new GhnShippingPartnerClient(options);

    await expect(
      client.createShipment({ ...validInput, wardCode: undefined }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a provider rejection to 503', async () => {
    mockFetch({ code: 400, message: 'invalid token' }, false, 400);
    const client = new GhnShippingPartnerClient(options);

    await expect(client.createShipment(validInput)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('cancels a shipment by tracking code', async () => {
    const fetchMock = mockFetch({ code: 200, data: [{ order_code: 'LXQ7A9', result: true }] });
    const client = new GhnShippingPartnerClient(options);

    await client.cancelShipment('LXQ7A9', 'Khách huỷ đơn');

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${options.baseUrl}/v2/switch-status/cancel`);
    expect(sentBody(fetchMock)).toEqual({ order_codes: ['LXQ7A9'] });
  });

  it('builds a print URL from the GHN token', async () => {
    mockFetch({ code: 200, data: { token: 'print-token' } });
    const client = new GhnShippingPartnerClient(options);

    await expect(client.createLabelUrl(['LXQ7A9'])).resolves.toBe(
      'https://dev-online-gateway.ghn.vn/a5/public-api/printA5?token=print-token',
    );
  });
});
