import { OUTBOX_EVENT_TYPE } from './notification.constants';
import { renderEmail } from './notification.templates';

const base = { recipientEmail: 'a@example.com', recipientName: 'Nguyễn Văn A', returnNo: 'RMA-20260924-000001', orderNo: 'DH-0009' };

describe('return email templates', () => {
  it('lists requested items and tells the customer not to ship yet', () => {
    const email = renderEmail(OUTBOX_EVENT_TYPE.RETURN_REQUESTED, {
      ...base,
      items: [{ name: 'Áo thun - L', quantity: 2 }],
    });
    expect(email.subject).toContain('RMA-20260924-000001');
    expect(email.text).toContain('Áo thun - L × 2');
    expect(email.text).toContain('CHƯA gửi hàng');
  });

  it('states the refund amount after receipt', () => {
    const email = renderEmail(OUTBOX_EVENT_TYPE.RETURN_RECEIVED, { ...base, refundCap: '350000.00' });
    expect(email.text).toMatch(/Số tiền hoàn: 350\.000/);
  });

  it('does not promise 0đ when nothing is refundable', () => {
    const email = renderEmail(OUTBOX_EVENT_TYPE.RETURN_RECEIVED, { ...base, refundCap: '0.00' });
    expect(email.text).toContain('Cửa hàng sẽ liên hệ');
    expect(email.text).not.toContain('Số tiền hoàn');
  });
});
