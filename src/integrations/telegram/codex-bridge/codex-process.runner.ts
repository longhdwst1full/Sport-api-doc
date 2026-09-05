import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface CodexRunRequest {
  taskId: string;
  workingDirectory: string;
  prompt: string;
  timeoutMs: number;
}

export interface CodexRunResult {
  exitCode: number;
  summary: string;
}

export function sanitizedEnvironment(environment: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(environment).filter(
      ([key]) => !/(TOKEN|SECRET|PASSWORD|DATABASE_URL|DIRECT_URL|CLOUDINARY|API_KEY)/i.test(key),
    ),
  );
}

export class CodexProcessRunner {
  private readonly active = new Map<string, ChildProcessWithoutNullStreams>();

  isBusy(): boolean {
    return this.active.size > 0;
  }

  cancel(taskId: string): boolean {
    const child = this.active.get(taskId);
    if (!child) return false;
    return child.kill('SIGTERM');
  }

  async run(request: CodexRunRequest): Promise<CodexRunResult> {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'sport-codex-task-'));
    const outputPath = join(temporaryDirectory, 'last-message.txt');
    const child = spawn(
      'codex',
      [
        'exec',
        '--cd',
        request.workingDirectory,
        '--sandbox',
        'workspace-write',
        '--approve-for-me',
        '--ephemeral',
        '--color',
        'never',
        '--output-last-message',
        outputPath,
        '-',
      ],
      {
        cwd: request.workingDirectory,
        env: sanitizedEnvironment(),
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    this.active.set(request.taskId, child);
    child.stdin.end([
      'Yêu cầu được OWNER xác nhận qua Telegram.',
      'Chỉ làm việc trong repository hiện tại và tuân thủ AGENTS.md/skills/rules.',
      'Không đọc hoặc tiết lộ secret. Không push, deploy, gửi tin nhắn, xóa dữ liệu hoặc chạy migration production trừ khi yêu cầu nói rõ.',
      '',
      request.prompt,
    ].join('\n'));

    let diagnostic = '';
    child.stderr.on('data', (chunk: Buffer) => {
      diagnostic = `${diagnostic}${chunk.toString('utf8')}`.slice(-8_000);
    });
    child.stdout.resume();

    const timeout = setTimeout(() => child.kill('SIGTERM'), request.timeoutMs);
    try {
      const exitCode = await new Promise<number>((resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code) => resolve(code ?? 1));
      });
      let summary = '';
      try {
        summary = (await readFile(outputPath, 'utf8')).trim();
      } catch {
        summary = diagnostic.trim();
      }
      return {
        exitCode,
        summary: summary || (exitCode === 0 ? 'Codex đã hoàn thành nhưng không có summary.' : 'Codex task thất bại.'),
      };
    } finally {
      clearTimeout(timeout);
      this.active.delete(request.taskId);
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }
}
