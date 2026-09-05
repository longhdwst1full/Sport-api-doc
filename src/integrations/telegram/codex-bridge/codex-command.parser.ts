import { CODEX_REPOSITORIES, CodexRepository } from './codex-task.types';

export type CodexBotCommand =
  | { type: 'HELP' }
  | { type: 'TASK'; repository: CodexRepository; prompt: string }
  | { type: 'CONFIRM'; taskId: string }
  | { type: 'CANCEL'; taskId: string }
  | { type: 'STATUS'; taskId?: string }
  | { type: 'TASKS' }
  | { type: 'INVALID'; message: string };

const TASK_ID_PATTERN = /^[a-f0-9]{8}$/;

export function parseCodexBotCommand(
  rawText: string,
  defaultRepository: CodexRepository,
): CodexBotCommand {
  const text = rawText.trim();
  const [rawCommand = '', ...argumentsList] = text.split(/\s+/);
  const command = rawCommand.toLowerCase().split('@', 1)[0];

  if (command === '/help' || command === '/start') return { type: 'HELP' };
  if (command === '/tasks') return { type: 'TASKS' };
  if (command === '/status') {
    const taskId = argumentsList[0]?.toLowerCase();
    if (taskId && !TASK_ID_PATTERN.test(taskId)) {
      return { type: 'INVALID', message: 'Task ID phải gồm 8 ký tự hex.' };
    }
    return { type: 'STATUS', ...(taskId ? { taskId } : {}) };
  }
  if (command === '/confirm' || command === '/cancel') {
    const taskId = argumentsList[0]?.toLowerCase();
    if (!taskId || !TASK_ID_PATTERN.test(taskId)) {
      return { type: 'INVALID', message: `Cú pháp: ${command} <task-id>` };
    }
    return { type: command === '/confirm' ? 'CONFIRM' : 'CANCEL', taskId };
  }
  if (command !== '/task') {
    return { type: 'INVALID', message: 'Lệnh chưa được hỗ trợ. Dùng /help để xem hướng dẫn.' };
  }

  let repository = defaultRepository;
  if (CODEX_REPOSITORIES.includes(argumentsList[0] as CodexRepository)) {
    repository = argumentsList.shift() as CodexRepository;
  }
  const prompt = argumentsList.join(' ').trim();
  if (prompt.length < 5) {
    return { type: 'INVALID', message: 'Cú pháp: /task [api|admin|client] <yêu cầu chi tiết>' };
  }
  if (prompt.length > 4_000) {
    return { type: 'INVALID', message: 'Yêu cầu tối đa 4.000 ký tự.' };
  }
  return { type: 'TASK', repository, prompt };
}
