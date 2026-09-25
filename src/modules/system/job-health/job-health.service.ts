import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramBotClient } from '../../../integrations/telegram/telegram-bot.client';
import { AuditReader, type RequestAuditEntry } from '../../audit/audit.reader';
import { AuditWriter } from '../../audit/audit.writer';
import type { SystemParameterCode } from '../parameters/system-parameter.catalog';
import { SystemParameterService } from '../parameters/system-parameter.service';
import {
  JOB_DEFINITIONS,
  JOB_HEALTH,
  JOB_HEALTH_AUDIT_ACTION,
  JOB_RUN_STATUS,
  type JobName,
  type JobRunStatus,
} from './job-health.constants';

interface JobRunSnapshot {
  status: JobRunStatus;
  durationMs: number;
  error?: string;
  consecutiveFailures?: number;
}

/**
 * Heartbeat và cảnh báo cho các job cron mà không thêm bảng: mỗi lượt chạy ghi audit
 * `system.job.run` (entity `JOB/<tên job>`), cảnh báo gửi Telegram.
 *
 * PROVIDER: Telegram lỗi hoặc chưa cấu hình không được làm hỏng job — chỉ log cảnh báo.
 * Giới hạn đã biết: job không tới được API (DNS/timeout phía pg_net) chỉ được phát hiện khi một job
 * khác còn chạy được (`checkStaleJobs`); nếu mọi job cùng chết thì không ai báo.
 */
@Injectable()
export class JobHealthService {
  private readonly logger = new Logger(JobHealthService.name);

  constructor(
    private readonly audit: AuditWriter,
    private readonly auditReader: AuditReader,
    private readonly parameters: SystemParameterService,
    private readonly telegram: TelegramBotClient,
    private readonly config: ConfigService,
  ) {}

  /**
   * Chạy `work`, ghi heartbeat và cảnh báo khi lỗi liên tiếp. Lỗi của `work` được ném lại nguyên
   * vẹn để controller trả đúng HTTP status như trước.
   *
   * SECURITY: chỉ gọi SAU khi đã kiểm Bearer secret — request chưa xác thực không được ghi audit.
   */
  async track<T>(job: JobName, requestId: string, work: () => Promise<T>): Promise<T> {
    const startedAt = Date.now();
    try {
      const result = await work();
      const durationMs = Date.now() - startedAt;
      // Log mọi lượt (audit chỉ ghi thành công mỗi 10 phút) để tìm endpoint nào gần mốc timeout 30s
      // của pg_net; lọc log theo `cronJob` và `durationMs`.
      this.logger.log({ cronJob: job, requestId, status: JOB_RUN_STATUS.SUCCEEDED, durationMs }, 'cron job finished');
      await this.safely(() => this.record(job, requestId, { status: JOB_RUN_STATUS.SUCCEEDED, durationMs }));
      await this.safely(() => this.checkStaleJobs(job, requestId));
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const durationMs = Date.now() - startedAt;
      this.logger.warn({ cronJob: job, requestId, status: JOB_RUN_STATUS.FAILED, durationMs, error: message.slice(0, 300) }, 'cron job failed');
      await this.safely(() =>
        this.record(job, requestId, { status: JOB_RUN_STATUS.FAILED, durationMs, error: message.slice(0, 300) }),
      );
      throw error;
    }
  }

  private async record(job: JobName, requestId: string, run: JobRunSnapshot): Promise<void> {
    const recent = await this.auditReader.findRecentForEntity('JOB', job, [JOB_HEALTH_AUDIT_ACTION.RUN], JOB_HEALTH.FAILURE_LOOKBACK);
    const previous = recent[0] ? this.readRun(recent[0]) : undefined;
    const priorFailures = this.countLeadingFailures(recent);

    if (run.status === JOB_RUN_STATUS.SUCCEEDED) {
      // Lượt thành công liên tiếp chỉ ghi mỗi SUCCESS_HEARTBEAT_MINUTES để job chạy mỗi phút không
      // làm phình audit; vẫn ghi ngay khi vừa hồi phục để mốc "thành công gần nhất" luôn đúng.
      const lastWrittenAt = recent[0]?.createdAt.getTime() ?? 0;
      const due = Date.now() - lastWrittenAt >= JOB_HEALTH.SUCCESS_HEARTBEAT_MINUTES * 60_000;
      if (previous?.status === JOB_RUN_STATUS.SUCCEEDED && !due) return;
      await this.write(job, requestId, run);
      if (priorFailures >= JOB_HEALTH.ALERT_AFTER_FAILURES) {
        await this.alert(`✅ Job ${job} đã chạy lại bình thường sau ${priorFailures} lượt lỗi.`);
      }
      return;
    }

    const consecutiveFailures = priorFailures + 1;
    await this.write(job, requestId, { ...run, consecutiveFailures });
    // Báo đúng một lần mỗi đợt lỗi: khi chạm ngưỡng, không báo lại ở các lượt lỗi tiếp theo.
    if (consecutiveFailures === JOB_HEALTH.ALERT_AFTER_FAILURES) {
      await this.alert(`🚨 Job ${job} lỗi ${consecutiveFailures} lượt liên tiếp.\nLỗi gần nhất: ${run.error ?? 'không rõ'}\nrequestId: ${requestId}`);
    }
  }

  /**
   * Job không có lượt thành công quá STALE_MINUTES (kể cả vì request không tới được API) thì báo;
   * mỗi job tối đa một lần trong STALE_REALERT_MINUTES. Bỏ qua job đang tắt bằng tham số hệ thống.
   */
  private async checkStaleJobs(currentJob: JobName, requestId: string): Promise<void> {
    const now = Date.now();
    for (const definition of JOB_DEFINITIONS) {
      if (definition.name === currentJob) continue;
      if (!(await this.isEnabled(definition.enabledParameters))) continue;
      const entries = await this.auditReader.findRecentForEntity(
        'JOB',
        definition.name,
        [JOB_HEALTH_AUDIT_ACTION.RUN, JOB_HEALTH_AUDIT_ACTION.STALE_ALERT],
        JOB_HEALTH.FAILURE_LOOKBACK,
      );
      // Chưa từng có heartbeat (mới bật tính năng): không đoán là chết, chờ lượt đầu tiên.
      if (entries.length === 0) continue;
      const lastSuccess = entries.find((entry) => entry.action === JOB_HEALTH_AUDIT_ACTION.RUN && this.readRun(entry)?.status === JOB_RUN_STATUS.SUCCEEDED);
      const lastAlert = entries.find((entry) => entry.action === JOB_HEALTH_AUDIT_ACTION.STALE_ALERT);
      const silentForMs = now - (lastSuccess?.createdAt.getTime() ?? entries[entries.length - 1].createdAt.getTime());
      if (silentForMs < JOB_HEALTH.STALE_MINUTES * 60_000) continue;
      if (lastAlert && now - lastAlert.createdAt.getTime() < JOB_HEALTH.STALE_REALERT_MINUTES * 60_000) continue;
      const minutes = Math.round(silentForMs / 60_000);
      await this.audit.write({
        requestId,
        sequenceNo: 1,
        actorType: 'SYSTEM',
        action: JOB_HEALTH_AUDIT_ACTION.STALE_ALERT,
        entityType: 'JOB',
        entityId: definition.name,
        after: { silentMinutes: minutes },
      });
      await this.alert(`⏰ Job ${definition.name} không có lượt chạy thành công trong ${minutes} phút (lịch ${definition.cadence}). Kiểm tra cron:*:status và net._http_response.`);
    }
  }

  private async isEnabled(codes: readonly SystemParameterCode[]): Promise<boolean> {
    if (codes.length === 0) return true;
    const flags = await Promise.all(codes.map((code) => this.parameters.getBoolean(code)));
    return flags.some(Boolean);
  }

  private write(job: JobName, requestId: string, run: JobRunSnapshot) {
    return this.audit.write({
      requestId,
      sequenceNo: 1,
      actorType: 'SYSTEM',
      action: JOB_HEALTH_AUDIT_ACTION.RUN,
      entityType: 'JOB',
      entityId: job,
      after: { ...run },
    });
  }

  private countLeadingFailures(entries: RequestAuditEntry[]): number {
    let count = 0;
    for (const entry of entries) {
      if (this.readRun(entry)?.status !== JOB_RUN_STATUS.FAILED) break;
      count += 1;
    }
    return count;
  }

  private readRun(entry: RequestAuditEntry): JobRunSnapshot | undefined {
    const after = entry.after as Partial<JobRunSnapshot> | null;
    return after?.status ? (after as JobRunSnapshot) : undefined;
  }

  private async alert(text: string): Promise<void> {
    const chatId = Number(this.config.get<string>('telegram.alertChatId'));
    if (!this.config.get<string>('telegram.botToken') || !Number.isSafeInteger(chatId) || chatId === 0) {
      this.logger.warn(`Job alert not sent (Telegram not configured): ${text}`);
      return;
    }
    await this.telegram.sendMessage(chatId, text);
  }

  /** Heartbeat/cảnh báo là phụ trợ: lỗi ở đây chỉ log, không làm hỏng kết quả của job. */
  private async safely(work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (error) {
      this.logger.warn(`Job health bookkeeping failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
