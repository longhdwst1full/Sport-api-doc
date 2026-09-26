import { Prisma } from '@prisma/client';
import type { ReturnQueryFromVNPay } from 'vnpay';
import type { PrismaService } from '../../../database/prisma.service';
import { PAYMENT_STATUS, VNPAY_IPN_RESPONSE } from '../payment.constants';
import type { VnpayGateway, VnpayVerification } from './vnpay.gateway';
import { VnpayService } from './vnpay.service';

describe('VnpayService.handleIpn', () => {
  const query = { vnp_TxnRef: 'PAY-ORD-1' } as unknown as ReturnQueryFromVNPay;

  function createService(options: {
    verification: Partial<VnpayVerification>;
    payment?: Record<string, unknown> | null;
    enabled?: boolean;
  }) {
    // Khai báo kiểu cho mock để đọc lại tham số mà không rơi vào `any`.
    const paymentUpdate =
      jest.fn<Promise<unknown>, [{ data: Record<string, unknown> }]>().mockResolvedValue({});
    const orderUpdate = jest.fn().mockResolvedValue({});
    const transactionCreate = jest.fn().mockResolvedValue({});
    const tx = {
      payment: {
        findUnique: jest.fn().mockResolvedValue(
          options.payment === undefined
            ? {
                id: 1n,
                orderId: 2n,
                status: PAYMENT_STATUS.PENDING,
                method: 'VNPAY',
                expectedAmount: new Prisma.Decimal(500_000),
                currencyCode: 'VND',
              }
            : options.payment,
        ),
        update: paymentUpdate,
      },
      order: { update: orderUpdate },
      paymentTransaction: { create: transactionCreate },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 99n }) },
    };
    const prisma = {
      $transaction: (fn: (t: unknown) => Promise<unknown>) => fn(tx),
    } as unknown as PrismaService;
    const gateway = {
      enabled: options.enabled ?? true,
      verifyIpn: (): VnpayVerification => ({
        isVerified: true,
        isSuccess: true,
        amount: 500_000,
        transactionNo: '1234',
        responseCode: '00',
        ...options.verification,
      }),
    } as unknown as VnpayGateway;

    return { service: new VnpayService(prisma, gateway), paymentUpdate, orderUpdate, transactionCreate };
  }

  it('từ chối khi chữ ký không hợp lệ và không ghi gì', async () => {
    const { service, paymentUpdate } = createService({ verification: { isVerified: false } });
    await expect(service.handleIpn(query)).resolves.toEqual(VNPAY_IPN_RESPONSE.INVALID_SIGNATURE);
    expect(paymentUpdate).not.toHaveBeenCalled();
  });

  it('báo không tìm thấy khi paymentRef lạ', async () => {
    const { service, paymentUpdate } = createService({ verification: {}, payment: null });
    await expect(service.handleIpn(query)).resolves.toEqual(VNPAY_IPN_RESPONSE.ORDER_NOT_FOUND);
    expect(paymentUpdate).not.toHaveBeenCalled();
  });

  it('từ chối khi số tiền lệch so với đơn hàng', async () => {
    const { service, paymentUpdate } = createService({ verification: { amount: 100 } });
    await expect(service.handleIpn(query)).resolves.toEqual(VNPAY_IPN_RESPONSE.INVALID_AMOUNT);
    expect(paymentUpdate).not.toHaveBeenCalled();
  });

  it('ghi nhận thành công và gán người xác nhận là tài khoản hệ thống', async () => {
    const { service, paymentUpdate, orderUpdate, transactionCreate } = createService({ verification: {} });
    await expect(service.handleIpn(query)).resolves.toEqual(VNPAY_IPN_RESPONSE.SUCCESS);
    const written = paymentUpdate.mock.calls[0]?.[0];
    expect(written?.data.status).toBe(PAYMENT_STATUS.SUCCESS);
    expect(written?.data.confirmedBy).toBe(99n);
    expect(orderUpdate).toHaveBeenCalled();
    expect(transactionCreate).toHaveBeenCalled();
  });

  it('gọi lại lần hai không cộng tiền thêm lần nữa', async () => {
    const { service, paymentUpdate } = createService({
      verification: {},
      payment: {
        id: 1n, orderId: 2n, status: PAYMENT_STATUS.SUCCESS, method: 'VNPAY',
        expectedAmount: new Prisma.Decimal(500_000), currencyCode: 'VND',
      },
    });
    await expect(service.handleIpn(query)).resolves.toEqual(VNPAY_IPN_RESPONSE.ALREADY_CONFIRMED);
    expect(paymentUpdate).not.toHaveBeenCalled();
  });

  it('IPN đến muộn sau khi đã hoàn tiền không lật payment REFUNDED', async () => {
    const { service, paymentUpdate } = createService({
      verification: {},
      payment: {
        id: 1n, orderId: 2n, status: PAYMENT_STATUS.REFUNDED, method: 'VNPAY',
        expectedAmount: new Prisma.Decimal(500_000), currencyCode: 'VND',
      },
    });
    await expect(service.handleIpn(query)).resolves.toEqual(VNPAY_IPN_RESPONSE.ALREADY_CONFIRMED);
    expect(paymentUpdate).not.toHaveBeenCalled();
  });

  it('IPN thành công đến sau khi đơn đã huỷ vì quá hạn không lật payment về SUCCESS', async () => {
    const { service, paymentUpdate } = createService({
      verification: {},
      payment: {
        id: 1n, orderId: 2n, status: PAYMENT_STATUS.CANCELLED, method: 'VNPAY',
        expectedAmount: new Prisma.Decimal(500_000), currencyCode: 'VND',
      },
    });
    // Trả "đã xử lý" để VNPay ngừng gọi lại; việc hoàn tiền (nếu có) được ghi log cho vận hành.
    await expect(service.handleIpn(query)).resolves.toEqual(VNPAY_IPN_RESPONSE.ALREADY_CONFIRMED);
    expect(paymentUpdate).not.toHaveBeenCalled();
  });

  it('đánh dấu thất bại khi VNPay trả mã lỗi', async () => {
    const { service, paymentUpdate } = createService({
      verification: { isSuccess: false, responseCode: '24' },
    });
    await expect(service.handleIpn(query)).resolves.toEqual(VNPAY_IPN_RESPONSE.SUCCESS);
    const written = paymentUpdate.mock.calls[0]?.[0];
    expect(written?.data.status).toBe(PAYMENT_STATUS.FAILED);
    expect(written?.data.confirmedBy).toBeNull();
  });

  it('không xử lý gì khi VNPay chưa được cấu hình', async () => {
    const { service, paymentUpdate } = createService({ verification: {}, enabled: false });
    await expect(service.handleIpn(query)).resolves.toEqual(VNPAY_IPN_RESPONSE.UNKNOWN_ERROR);
    expect(paymentUpdate).not.toHaveBeenCalled();
  });
});
