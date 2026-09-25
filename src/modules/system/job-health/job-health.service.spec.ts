import type { ConfigService } from '@nestjs/config';
import type { TelegramBotClient } from '../../../integrations/telegram/telegram-bot.client';
import type { AuditReader, RequestAuditEntry } from '../../audit/audit.reader';
import type { AuditWriter } from '../../audit/audit.writer';
import type { SystemParameterService } from '../parameters/system-parameter.service';
import { JOB_HEALTH, JOB_HEALTH_AUDIT_ACTION, JOB_NAME } from './job-health.constants';
import { JobHealthService } from './job-health.service';

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);
const run = (status: 'SUCCEEDED' | 'FAILED', createdAt: Date): RequestAuditEntry => ({
  action: JOB_HEALTH_AUDIT_ACTION.RUN,
  entityType: 'JOB',
  entityId: 'x',
  actorUserId: null,
  after: { status, durationMs: 1 },
  createdAt,
});

function harness(history: Partial<Record<string, RequestAuditEntry[]>> = {}, options: { telegramFails?: boolean } = {}) {
  const write = jest.fn().mockResolvedValue({ id: '1', createdAt: new Date().toISOString() });
  const findRecentForEntity = jest.fn((_type: string, entityId: string) => Promise.resolve(history[entityId] ?? []));
  const sendMessage = options.telegramFails
    ? jest.fn().mockRejectedValue(new Error('telegram down'))
    : jest.fn().mockResolvedValue(undefined);
  const config = {
    get: jest.fn((key: string) => ({ 'telegram.botToken': '1:x', 'telegram.alertChatId': '12345' })[key]),
  } as unknown as ConfigService;
  const service = new JobHealthService(
    { write } as unknown as AuditWriter,
    { findRecentForEntity } as unknown as AuditReader,
    { getBoolean: jest.fn().mockResolvedValue(true) } as unknown as SystemParameterService,
    { sendMessage } as unknown as TelegramBotClient,
    config,
  );
  return { service, write, sendMessage };
}

describe('JobHealthService', () => {
  it('writes a heartbeat on the first success and skips repeated successes inside the heartbeat window', async () => {
    const first = harness();
    await first.service.track(JOB_NAME.NOTIFICATION_DISPATCH, 'r1', () => Promise.resolve('ok'));
    expect(first.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'system.job.run', entityId: 'notification-dispatch' }));

    const repeated = harness({ 'notification-dispatch': [run('SUCCEEDED', minutesAgo(2))] });
    await repeated.service.track(JOB_NAME.NOTIFICATION_DISPATCH, 'r2', () => Promise.resolve('ok'));
    expect(repeated.write).not.toHaveBeenCalled();
  });

  it('alerts exactly once when failures reach the threshold and rethrows the job error', async () => {
    const atThreshold = harness({ 'reservation-expiry': [run('FAILED', minutesAgo(5))] });
    await expect(
      atThreshold.service.track(JOB_NAME.RESERVATION_EXPIRY, 'r3', () => Promise.reject(new Error('db down'))),
    ).rejects.toThrow('db down');
    expect(atThreshold.sendMessage).toHaveBeenCalledTimes(1);
    const [[, alertText]] = atThreshold.sendMessage.mock.calls as Array<[number, string]>;
    expect(alertText).toContain(`lỗi ${JOB_HEALTH.ALERT_AFTER_FAILURES} lượt liên tiếp`);

    const pastThreshold = harness({ 'reservation-expiry': [run('FAILED', minutesAgo(5)), run('FAILED', minutesAgo(10))] });
    await expect(
      pastThreshold.service.track(JOB_NAME.RESERVATION_EXPIRY, 'r4', () => Promise.reject(new Error('db down'))),
    ).rejects.toThrow('db down');
    expect(pastThreshold.sendMessage).not.toHaveBeenCalled();
  });

  it('sends a recovery message after an alerted failure streak', async () => {
    const recovering = harness({ 'order-maintenance': [run('FAILED', minutesAgo(5)), run('FAILED', minutesAgo(10))] });

    await recovering.service.track(JOB_NAME.ORDER_MAINTENANCE, 'r5', () => Promise.resolve('ok'));

    expect(recovering.sendMessage.mock.calls.some(([, text]) => String(text).includes('chạy lại bình thường'))).toBe(true);
  });

  it('flags another job that has been silent past the stale window, once per re-alert window', async () => {
    const stale = harness({
      'notification-dispatch': [run('SUCCEEDED', minutesAgo(1))],
      'flash-sale-quota-expiry': [run('SUCCEEDED', minutesAgo(JOB_HEALTH.STALE_MINUTES + 5))],
    });

    await stale.service.track(JOB_NAME.NOTIFICATION_DISPATCH, 'r6', () => Promise.resolve('ok'));

    expect(stale.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'system.job.stale-alert', entityId: 'flash-sale-quota-expiry' }));
    expect(stale.sendMessage.mock.calls.some(([, text]) => String(text).includes('flash-sale-quota-expiry'))).toBe(true);

    const alreadyAlerted = harness({
      'notification-dispatch': [run('SUCCEEDED', minutesAgo(1))],
      'flash-sale-quota-expiry': [
        { ...run('SUCCEEDED', minutesAgo(5)), action: JOB_HEALTH_AUDIT_ACTION.STALE_ALERT, after: { silentMinutes: 30 } },
        run('SUCCEEDED', minutesAgo(JOB_HEALTH.STALE_MINUTES + 10)),
      ],
    });
    await alreadyAlerted.service.track(JOB_NAME.NOTIFICATION_DISPATCH, 'r7', () => Promise.resolve('ok'));
    expect(alreadyAlerted.sendMessage).not.toHaveBeenCalled();
  });

  it('never fails the job because Telegram is down', async () => {
    const telegramDown = harness({ 'reservation-expiry': [run('FAILED', minutesAgo(5))] }, { telegramFails: true });

    await expect(
      telegramDown.service.track(JOB_NAME.RESERVATION_EXPIRY, 'r8', () => Promise.resolve('result')),
    ).resolves.toBe('result');
  });
});
