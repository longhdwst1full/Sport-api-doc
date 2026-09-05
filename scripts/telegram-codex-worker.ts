import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import {
  parseCodexBotCommand,
  type CodexBotCommand,
} from '../src/integrations/telegram/codex-bridge/codex-command.parser';
import { CodexProcessRunner } from '../src/integrations/telegram/codex-bridge/codex-process.runner';
import { CodexTaskStore } from '../src/integrations/telegram/codex-bridge/codex-task.store';
import {
  CODEX_REPOSITORIES,
  CODEX_TASK_STATUS,
  type CodexRepository,
  type CodexTask,
} from '../src/integrations/telegram/codex-bridge/codex-task.types';
import { TelegramPollingClient } from '../src/integrations/telegram/codex-bridge/telegram-polling.client';
import type { TelegramUpdate } from '../src/integrations/telegram/telegram.types';

for (const environmentFile of ['.env', '.env.local']) {
  const environmentPath = resolve(process.cwd(), environmentFile);
  if (existsSync(environmentPath)) process.loadEnvFile(environmentPath);
}

const HELP_TEXT = [
  'Sport Codex Worker',
  '/task [api|admin|client] <yêu cầu> — tạo task chờ xác nhận',
  '/confirm <task-id> — cho Codex thực thi task',
  '/cancel <task-id> — hủy task',
  '/status [task-id] — xem trạng thái',
  '/tasks — xem 10 task gần nhất',
  '',
  'Mọi task chạy trong workspace-write sandbox và không truyền secret vào Codex child process.',
].join('\n');

interface WorkerConfig {
  token: string;
  allowedUserId: number;
  workspaceRoot: string;
  defaultRepository: CodexRepository;
  timeoutMs: number;
  stateFile: string;
}

function loadConfig(): WorkerConfig {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const allowedUserId = Number(process.env.TELEGRAM_ALLOWED_USER_ID);
  const workspaceRoot = resolve(process.env.TELEGRAM_CODEX_WORKSPACE_ROOT ?? '..');
  const defaultRepository = (process.env.TELEGRAM_CODEX_DEFAULT_REPO ?? 'api') as CodexRepository;
  const timeoutMs = Number(process.env.TELEGRAM_CODEX_TIMEOUT_MS ?? 1_800_000);
  if (process.env.TELEGRAM_CODEX_ENABLED !== 'true') {
    throw new Error('TELEGRAM_CODEX_ENABLED=true is required');
  }
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required');
  if (!Number.isSafeInteger(allowedUserId) || allowedUserId <= 0) {
    throw new Error('TELEGRAM_ALLOWED_USER_ID must be a positive integer');
  }
  if (!CODEX_REPOSITORIES.includes(defaultRepository)) {
    throw new Error('TELEGRAM_CODEX_DEFAULT_REPO must be api, admin, or client');
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 60_000 || timeoutMs > 3_600_000) {
    throw new Error('TELEGRAM_CODEX_TIMEOUT_MS must be between 60000 and 3600000');
  }
  for (const repository of CODEX_REPOSITORIES) {
    const repositoryPath = resolve(workspaceRoot, repository);
    if (!repositoryPath.startsWith(`${workspaceRoot}/`) || !existsSync(join(repositoryPath, '.git'))) {
      throw new Error(`Repository is unavailable: ${repository}`);
    }
  }
  return {
    token,
    allowedUserId,
    workspaceRoot,
    defaultRepository,
    timeoutMs,
    stateFile: resolve(process.env.TELEGRAM_CODEX_STATE_FILE ?? '.telegram-codex/state.json'),
  };
}

function formatTask(task: CodexTask): string {
  return [
    `Task ${task.id} · ${task.status}`,
    `Repo: ${task.repository}`,
    `Yêu cầu: ${task.prompt}`,
    ...(task.summary ? [`Kết quả: ${task.summary}`] : []),
    ...(task.error ? [`Lỗi: ${task.error}`] : []),
  ].join('\n');
}

class TelegramCodexWorker {
  private readonly telegram: TelegramPollingClient;
  private readonly store: CodexTaskStore;
  private readonly runner = new CodexProcessRunner();
  private stopped = false;

  constructor(private readonly config: WorkerConfig) {
    this.telegram = new TelegramPollingClient(config.token);
    this.store = new CodexTaskStore(config.stateFile);
  }

  stop(): void {
    this.stopped = true;
  }

  async check(): Promise<void> {
    const [identity, webhook] = await Promise.all([
      this.telegram.getMe(),
      this.telegram.getWebhookInfo(),
    ]);
    if (webhook.url) {
      throw new Error('Telegram webhook đang bật. Chạy yarn telegram:webhook:delete trước local worker.');
    }
    const codex = spawnSync('codex', ['login', 'status'], { encoding: 'utf8', shell: false });
    if (codex.status !== 0) throw new Error('Codex CLI chưa đăng nhập');
    console.log(JSON.stringify({
      ok: true,
      bot: identity.username,
      webhook: 'disabled',
      codex: 'authenticated',
      repositories: CODEX_REPOSITORIES,
    }, null, 2));
  }

  async run(): Promise<void> {
    await this.check();
    await this.telegram.sendMessage(this.config.allowedUserId, '🟢 Sport Codex Worker đã sẵn sàng nhận /task.');
    while (!this.stopped) {
      try {
        const state = await this.store.load();
        const updates = await this.telegram.getUpdates(state.nextUpdateOffset);
        for (const update of updates) await this.handleUpdate(update);
      } catch (error) {
        console.error(error instanceof Error ? error.message : 'Telegram polling failed');
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 3_000));
      }
    }
  }

  private async handleUpdate(update: TelegramUpdate): Promise<void> {
    await this.store.mutate((state) => {
      state.nextUpdateOffset = Math.max(state.nextUpdateOffset, update.update_id + 1);
    });
    const message = update.message;
    if (!message?.from || message.from.id !== this.config.allowedUserId || !message.text) return;
    const command = parseCodexBotCommand(message.text, this.config.defaultRepository);
    await this.handleCommand(command, message.chat.id, message.from.id);
  }

  private async handleCommand(command: CodexBotCommand, chatId: number, userId: number): Promise<void> {
    if (command.type === 'HELP') return this.telegram.sendMessage(chatId, HELP_TEXT);
    if (command.type === 'INVALID') return this.telegram.sendMessage(chatId, command.message);
    if (command.type === 'TASKS') {
      const tasks = (await this.store.load()).tasks.slice(-10).reverse();
      return this.telegram.sendMessage(
        chatId,
        tasks.length ? tasks.map((task) => `${task.id} · ${task.repository} · ${task.status}`).join('\n') : 'Chưa có task.',
      );
    }
    if (command.type === 'STATUS') {
      const tasks = (await this.store.load()).tasks;
      const task = command.taskId
        ? tasks.find((candidate) => candidate.id === command.taskId)
        : tasks.at(-1);
      return this.telegram.sendMessage(chatId, task ? formatTask(task) : 'Không tìm thấy task.');
    }
    if (command.type === 'TASK') {
      const task: CodexTask = {
        id: randomBytes(4).toString('hex'),
        repository: command.repository,
        prompt: command.prompt,
        chatId,
        requestedBy: userId,
        status: CODEX_TASK_STATUS.PENDING_CONFIRMATION,
        createdAt: new Date().toISOString(),
      };
      await this.store.mutate((state) => state.tasks.push(task));
      return this.telegram.sendMessage(
        chatId,
        `${formatTask(task)}\n\nXác nhận thực thi: /confirm ${task.id}`,
      );
    }
    const task = await this.store.find(command.taskId);
    if (!task || task.requestedBy !== userId) {
      return this.telegram.sendMessage(chatId, 'Không tìm thấy task hợp lệ.');
    }
    if (command.type === 'CANCEL') {
      if (task.status === CODEX_TASK_STATUS.RUNNING) this.runner.cancel(task.id);
      if (![CODEX_TASK_STATUS.PENDING_CONFIRMATION, CODEX_TASK_STATUS.RUNNING].includes(task.status)) {
        return this.telegram.sendMessage(chatId, `Task ${task.id} không thể hủy ở trạng thái ${task.status}.`);
      }
      await this.updateTask(task.id, {
        status: CODEX_TASK_STATUS.CANCELLED,
        finishedAt: new Date().toISOString(),
      });
      return this.telegram.sendMessage(chatId, `Đã hủy task ${task.id}.`);
    }
    if (task.status !== CODEX_TASK_STATUS.PENDING_CONFIRMATION) {
      return this.telegram.sendMessage(chatId, `Task ${task.id} đang ở trạng thái ${task.status}.`);
    }
    if (this.runner.isBusy()) {
      return this.telegram.sendMessage(chatId, 'Codex đang chạy task khác. Hãy xác nhận lại sau.');
    }
    await this.updateTask(task.id, {
      status: CODEX_TASK_STATUS.RUNNING,
      startedAt: new Date().toISOString(),
    });
    await this.telegram.sendMessage(chatId, `▶️ Codex bắt đầu task ${task.id} trên repo ${task.repository}.`);
    void this.execute(task);
  }

  private async execute(task: CodexTask): Promise<void> {
    try {
      const result = await this.runner.run({
        taskId: task.id,
        workingDirectory: resolve(this.config.workspaceRoot, task.repository),
        prompt: task.prompt,
        timeoutMs: this.config.timeoutMs,
      });
      const current = await this.store.find(task.id);
      if (current?.status === CODEX_TASK_STATUS.CANCELLED) return;
      const status = result.exitCode === 0 ? CODEX_TASK_STATUS.COMPLETED : CODEX_TASK_STATUS.FAILED;
      await this.updateTask(task.id, {
        status,
        finishedAt: new Date().toISOString(),
        summary: result.summary,
      });
      await this.telegram.sendMessage(task.chatId, `${status === CODEX_TASK_STATUS.COMPLETED ? '✅' : '❌'} ${formatTask({ ...task, status, summary: result.summary })}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Codex process failed';
      await this.updateTask(task.id, {
        status: CODEX_TASK_STATUS.FAILED,
        finishedAt: new Date().toISOString(),
        error: message,
      });
      await this.telegram.sendMessage(task.chatId, `❌ Task ${task.id} thất bại: ${message}`);
    }
  }

  private async updateTask(taskId: string, patch: Partial<CodexTask>): Promise<void> {
    await this.store.mutate((state) => {
      const task = state.tasks.find((candidate) => candidate.id === taskId);
      if (task) Object.assign(task, patch);
    });
  }
}

const worker = new TelegramCodexWorker(loadConfig());
process.once('SIGINT', () => worker.stop());
process.once('SIGTERM', () => worker.stop());

async function main(): Promise<void> {
  if (process.argv.includes('--check')) {
    await worker.check();
  } else {
    await worker.run();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Telegram Codex worker failed');
  process.exitCode = 1;
});
