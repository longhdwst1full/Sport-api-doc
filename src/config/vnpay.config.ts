import { registerAs } from '@nestjs/config';

/**
 * Cấu hình VNPay. Khoá bí mật chỉ đọc từ biến môi trường, không bao giờ nằm trong
 * mã nguồn hay database. Thiếu cấu hình thì tính năng tự tắt thay vì chạy nửa vời:
 * `PaymentService` từ chối phương thức VNPAY khi `enabled === false`.
 */
export default registerAs('vnpay', () => {
  const terminalCode = process.env.VNPAY_TMN_CODE?.trim() ?? '';
  const hashSecret = process.env.VNPAY_HASH_SECRET?.trim() ?? '';

  return {
    enabled: Boolean(terminalCode && hashSecret),
    terminalCode,
    hashSecret,
    paymentUrl:
      process.env.VNPAY_PAYMENT_URL?.trim() ||
      'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
    returnUrl:
      process.env.VNPAY_RETURN_URL?.trim() || 'http://localhost:3000/checkout/vnpay-return',
    /** Mã tiền tệ và locale theo đặc tả VNPay; không cấu hình được để tránh sai lệch chữ ký. */
    currencyCode: 'VND',
    locale: process.env.VNPAY_LOCALE?.trim() || 'vn',
    /** Cửa sổ hợp lệ của lệnh thanh toán, phút. */
    expireMinutes: Number(process.env.VNPAY_EXPIRE_MINUTES ?? 15),
  };
});
