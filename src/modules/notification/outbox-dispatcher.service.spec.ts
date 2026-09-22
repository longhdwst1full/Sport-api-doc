import type { PrismaService } from '../../database/prisma.service';
import type { EmailClient } from '../../integrations/email/email.client';
import { OutboxDispatcherService } from './outbox-dispatcher.service';
import { OUTBOX_EVENT_TYPE, OUTBOX_MAX_ATTEMPTS, OUTBOX_STATUS } from './notification.constants';

const payload = {
  recipientEmail: 'khach@example.com',
  recipientName: 'Nguyễn Minh Anh',
  orderNo: 'ORD-1',
  grandTotal: '1000000.00',
  itemCount: 2,
};

function buildService(overrides: {
  events?: Array<{ id: bigint; event_type: string; payload_json: unknown; attempts: number }>;
  existingNotification?: { id: bigint; status: string } | null;
  sendFails?: boolean;
} = {}) {
  const events = overrides.events ?? [
    { id: 5n, event_type: OUTBOX_EVENT_TYPE.ORDER_PLACED, payload_json: payload, attempts: 0 },
  ];
  const queryRaw = jest
    .fn<Promise<unknown[]>, [TemplateStringsArray, ...unknown[]]>()
    .mockResolvedValue(events);
  const outboxUpdate = jest
    .fn<Promise<unknown>, [{ where: { id: bigint }; data: Record<string, unknown> }]>()
    .mockResolvedValue({});
  const outboxUpdateMany = jest.fn().mockResolvedValue({ count: events.length });
  const notificationCreate = jest.fn().mockResolvedValue({ id: 9n });
  const notificationUpdate = jest
    .fn<Promise<unknown>, [{ data: Record<string, unknown> }]>()
    .mockResolvedValue({ id: 9n });
  const notificationFindUnique = jest
    .fn()
    .mockResolvedValue(overrides.existingNotification ?? null);
  const prisma = {
    isEnabled: () => true,
    outboxEvent: { update: outboxUpdate, updateMany: outboxUpdateMany },
    notification: {
      create: notificationCreate,
      update: notificationUpdate,
      findUnique: notificationFindUnique,
    },
    $transaction: (work: (client: unknown) => unknown) =>
      work({ $queryRaw: queryRaw, outboxEvent: { updateMany: outboxUpdateMany } }),
  } as unknown as PrismaService;
  const send = overrides.sendFails
    ? jest.fn().mockRejectedValue(new Error('Mailtrap trả 429'))
    : jest.fn().mockResolvedValue({ provider: 'MAILTRAP', messageIds: ['msg-1'] });
  const email = { send } as unknown as EmailClient;
  return {
    service: new OutboxDispatcherService(prisma, email),
    send,
    outboxUpdate,
    notificationCreate,
    notificationUpdate,
    queryRaw,
  };
}

describe('OutboxDispatcherService', () => {
  /**
   * Không có `SKIP LOCKED` thì hai replica cùng chờ trên một dòng rồi xử lý nối tiếp — chạy thêm
   * máy không nhanh hơn chút nào.
   */
  it('lấy việc bằng FOR UPDATE SKIP LOCKED', async () => {
    const { service, queryRaw } = buildService();

    await service.run('run-1');

    const sql = queryRaw.mock.calls[0][0].join('?');
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
  });

  it('gửi email rồi đánh dấu sự kiện đã xong', async () => {
    const { service, send, outboxUpdate } = buildService();

    const result = await service.run('run-1');

    expect(send).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ claimed: 1, sent: 1, retried: 0, dead: 0 });
    expect(outboxUpdate.mock.calls[0][0].data).toMatchObject({ status: OUTBOX_STATUS.DONE });
  });

  /** Khách không nên nhận email thứ hai vì một sự cố của chúng ta. */
  it('bỏ qua sự kiện đã gửi thành công trước đó', async () => {
    const { service, send } = buildService({
      existingNotification: { id: 9n, status: 'SENT' },
    });

    const result = await service.run('run-1');

    expect(send).not.toHaveBeenCalled();
    expect(result).toMatchObject({ duplicated: 1, sent: 0 });
  });

  it('hẹn thử lại với backoff khi nhà cung cấp lỗi', async () => {
    const { service, outboxUpdate } = buildService({ sendFails: true });

    const result = await service.run('run-1');

    expect(result).toMatchObject({ retried: 1, dead: 0 });
    const data = outboxUpdate.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: OUTBOX_STATUS.PENDING, attempts: 1 });
    expect(data.lastError).toContain('429');
    expect((data.availableAt as Date).getTime()).toBeGreaterThan(Date.now());
  });

  /** Hết lượt thì dừng hẳn nhưng KHÔNG xoá dòng: vận hành cần đọc lại cái gì đã mất. */
  it('chuyển sang DEAD khi hết lượt thử', async () => {
    const { service, outboxUpdate } = buildService({
      sendFails: true,
      events: [
        {
          id: 5n,
          event_type: OUTBOX_EVENT_TYPE.ORDER_PLACED,
          payload_json: payload,
          attempts: OUTBOX_MAX_ATTEMPTS - 1,
        },
      ],
    });

    const result = await service.run('run-1');

    expect(result).toMatchObject({ dead: 1, retried: 0 });
    expect(outboxUpdate.mock.calls[0][0].data).toMatchObject({ status: OUTBOX_STATUS.DEAD });
  });

  it('giữ lại dòng nhật ký FAILED để lần sau dùng lại', async () => {
    const { service, notificationUpdate } = buildService({ sendFails: true });

    await service.run('run-1');

    const statuses = notificationUpdate.mock.calls.map(([args]) => args.data.status);
    expect(statuses).toContain('FAILED');
  });
});
