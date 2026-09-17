/**
 * Gửi một email thử qua đúng adapter mà ứng dụng dùng, để xác minh cấu hình Mailtrap.
 *
 * Chạy: yarn email:test [email-nguoi-nhan]
 *
 * SECURITY: script gửi thật ra Internet. Ngoài production, MailtrapEmailClient tự đổi hướng mọi
 * người nhận về MAILTRAP_REDIRECT_ALL_TO, nên địa chỉ truyền vào chỉ có tác dụng khi biến đó trống.
 */
import { MailtrapEmailClient } from '../src/integrations/email/mailtrap-email.client';

async function main(): Promise<void> {
  const token = process.env.MAILTRAP_API_TOKEN;
  const senderEmail = process.env.MAILTRAP_SENDER_EMAIL;
  if (!token || !senderEmail) {
    throw new Error('Thiếu MAILTRAP_API_TOKEN hoặc MAILTRAP_SENDER_EMAIL trong .env.local');
  }

  const recipient = process.argv[2] ?? process.env.MAILTRAP_REDIRECT_ALL_TO;
  if (!recipient) {
    throw new Error('Không có người nhận: truyền tham số hoặc đặt MAILTRAP_REDIRECT_ALL_TO');
  }

  // Script chạy ngoài Nest nên không có bảng tham số; đọc thẳng env như một resolver.
  const client = new MailtrapEmailClient(() =>
    Promise.resolve({
      token,
      senderEmail,
      senderName: process.env.MAILTRAP_SENDER_NAME ?? 'Bảo An Sport',
      ...(process.env.MAILTRAP_REDIRECT_ALL_TO
        ? { redirectAllTo: process.env.MAILTRAP_REDIRECT_ALL_TO }
        : {}),
    }),
  );

  const result = await client.send({
    to: [{ email: recipient }],
    subject: 'Bảo An Sport — kiểm tra cấu hình gửi email',
    text: 'Cấu hình Mailtrap hoạt động. Email này gửi từ scripts/send-test-email.ts.',
    category: 'Integration Test',
  });

  console.log('Đã gửi:', result);
  console.log('Xem log tại https://mailtrap.io/sending/email_logs');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
