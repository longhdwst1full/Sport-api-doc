import { ServiceUnavailableException } from '@nestjs/common';
import { MailtrapEmailClient } from './mailtrap-email.client';

const send = jest.fn();
jest.mock('mailtrap', () => ({
  MailtrapClient: jest.fn().mockImplementation(() => ({ send })),
}));

const OPTIONS = {
  token: 'test-token-0123456789',
  senderEmail: 'hello@demomailtrap.co',
  senderName: 'Bảo An Sport',
};

/** Cấu hình giờ đọc tại thời điểm gửi, nên client nhận một hàm thay vì object cố định. */
const options = () => Promise.resolve(OPTIONS);

describe('MailtrapEmailClient', () => {
  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue({ success: true, message_ids: ['msg-1'] });
  });

  it('sends to the requested recipients and returns provider message ids', async () => {
    const client = new MailtrapEmailClient(options);

    const result = await client.send({
      to: [{ email: 'khach@example.com', name: 'Khách' }],
      subject: 'Đơn hàng đã xác nhận',
      text: 'Cảm ơn bạn.',
      category: 'Order',
    });

    expect(result).toEqual({ provider: 'MAILTRAP', messageIds: ['msg-1'] });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: { email: 'hello@demomailtrap.co', name: 'Bảo An Sport' },
        to: [{ email: 'khach@example.com', name: 'Khách' }],
        subject: 'Đơn hàng đã xác nhận',
        category: 'Order',
      }),
    );
  });

  it('redirects every recipient to the test inbox outside production', async () => {
    const client = new MailtrapEmailClient(() =>
      Promise.resolve({ ...OPTIONS, redirectAllTo: 'qa@example.com' }),
    );

    await client.send({
      to: [{ email: 'khach@example.com' }, { email: 'khac@example.com' }],
      subject: 'Thử',
      text: 'Thử',
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: [{ email: 'qa@example.com' }] }),
    );
  });

  it('maps a provider failure to 503 without leaking recipients', async () => {
    send.mockRejectedValue(new Error('invalid token'));
    const client = new MailtrapEmailClient(options);

    await expect(
      client.send({ to: [{ email: 'khach@example.com' }], subject: 'Thử', text: 'Thử' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('refuses an email with no recipient', async () => {
    const client = new MailtrapEmailClient(options);

    await expect(client.send({ to: [], subject: 'Thử', text: 'Thử' })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(send).not.toHaveBeenCalled();
  });
});
