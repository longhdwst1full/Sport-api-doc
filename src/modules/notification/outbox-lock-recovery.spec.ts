import type { PrismaService } from '../../database/prisma.service';
import type { EmailClient } from '../../integrations/email/email.client';
import { OutboxDispatcherService } from './outbox-dispatcher.service';
import {
  OUTBOX_EVENT_TYPE,
  OUTBOX_LOCK_TIMEOUT_SECONDS,
  OUTBOX_STATUS,
} from './notification.constants';

/**
 * Thu hồi dòng outbox bị kẹt.
 *
 * `claim` đặt `status = PROCESSING`, còn điều kiện lấy việc chỉ nhận `PENDING`. Tiến trình chết
 * giữa `claim` và lúc cập nhật kết quả — đúng thứ xảy ra khi cron timeout vì cold start, đã đo
 * 3/20 lượt trên production — thì dòng đó nằm `PROCESSING` vĩnh viễn: không lỗi, không log, không
 * retry, khách đơn giản là không nhận email.
 */
const payload = {
  recipientEmail: 'khach@example.com',
  recipientName: 'Khách',
  orderNo: 'ORD-1',
  grandTotal: '1000000.00',
  itemCount: 1,
};

function buildService(rows: Array<Record<string, unknown>>) {
  const queryRaw = jest
    .fn<Promise<unknown[]>, [TemplateStringsArray, ...unknown[]]>()
    .mockResolvedValue(rows);
  const updateMany = jest
    .fn<Promise<unknown>, [{ where: { id: { in: bigint[] } }; data: Record<string, unknown> }]>()
    .mockResolvedValue({ count: rows.length });
  const prisma = {
    isEnabled: () => true,
    outboxEvent: { update: jest.fn().mockResolvedValue({}), updateMany },
    notification: {
      create: jest.fn().mockResolvedValue({ id: 9n }),
      update: jest.fn().mockResolvedValue({ id: 9n }),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    $transaction: (work: (client: unknown) => unknown) =>
      work({ $queryRaw: queryRaw, outboxEvent: { updateMany } }),
  } as unknown as PrismaService;
  const email = {
    send: jest.fn().mockResolvedValue({ provider: 'MAILTRAP', messageIds: ['msg-1'] }),
  } as unknown as EmailClient;

  return { service: new OutboxDispatcherService(prisma, email), queryRaw, updateMany };
}

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: 5n,
    event_type: OUTBOX_EVENT_TYPE.ORDER_PLACED,
    payload_json: payload,
    attempts: 0,
    status: OUTBOX_STATUS.PENDING,
    ...overrides,
  };
}

describe('OutboxDispatcherService thu hồi lock quá hạn', () => {
  it('điều kiện lấy việc nhận cả dòng PROCESSING quá hạn', async () => {
    const { service, queryRaw } = buildService([event()]);

    await service.run('run-1');

    const params = queryRaw.mock.calls[0]?.slice(1) ?? [];
    expect(params).toContain(OUTBOX_STATUS.PENDING);
    expect(params).toContain(OUTBOX_STATUS.PROCESSING);
    expect(params).toContain(OUTBOX_LOCK_TIMEOUT_SECONDS);
  });

  /**
   * Một sự kiện luôn làm tiến trình chết phải tiến dần tới `DEAD` để vận hành nhìn thấy. Không đếm
   * lần chết dở thì nó được lấy lại vô hạn và không bao giờ lộ ra.
   */
  it('dòng thu hồi được tính thêm một lần thử', async () => {
    const { service, updateMany } = buildService([
      event({ status: OUTBOX_STATUS.PROCESSING, attempts: 2 }),
    ]);

    await service.run('run-2');

    const reclaimCall = updateMany.mock.calls.find(
      ([call]) => call.data.attempts !== undefined,
    );
    expect(reclaimCall?.[0].data).toMatchObject({
      status: OUTBOX_STATUS.PROCESSING,
      lockedBy: 'run-2',
      attempts: { increment: 1 },
    });
  });

  it('dòng PENDING bình thường không bị cộng thêm lần thử', async () => {
    const { service, updateMany } = buildService([event({ attempts: 0 })]);

    await service.run('run-3');

    for (const [call] of updateMany.mock.calls) {
      expect(call.data.attempts).toBeUndefined();
    }
  });

  /** Lấy được cả hai loại trong một lượt thì mỗi loại phải được cập nhật theo đúng cách của nó. */
  it('trộn dòng mới và dòng thu hồi trong cùng một lượt', async () => {
    const { service, updateMany } = buildService([
      event({ id: 1n, attempts: 0 }),
      event({ id: 2n, status: OUTBOX_STATUS.PROCESSING, attempts: 1 }),
    ]);

    await service.run('run-4');

    const fresh = updateMany.mock.calls.find(([call]) => call.data.attempts === undefined);
    const reclaimed = updateMany.mock.calls.find(([call]) => call.data.attempts !== undefined);
    expect(fresh?.[0].where.id.in).toEqual([1n]);
    expect(reclaimed?.[0].where.id.in).toEqual([2n]);
  });
});
