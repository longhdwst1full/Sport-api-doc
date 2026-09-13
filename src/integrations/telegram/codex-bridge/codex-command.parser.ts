import { CODEX_REPOSITORIES, CodexRepository } from './codex-task.types';

export type CodexBotCommand =
  | { type: 'HELP' }
  | { type: 'TASK'; repository: CodexRepository; prompt: string }
  | { type: 'CONFIRM'; taskId: string }
  | { type: 'CANCEL'; taskId: string }
  | { type: 'STATUS'; taskId?: string; repository?: CodexRepository }
  | { type: 'TASKS'; repository?: CodexRepository }
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
  if (command === '/tasks') {
    const repository = argumentsList[0]?.toLowerCase();
    if (repository && !CODEX_REPOSITORIES.includes(repository as CodexRepository)) {
      return { type: 'INVALID', message: 'Cú pháp: /tasks [api|admin|client]' };
    }
    return {
      type: 'TASKS',
      ...(repository ? { repository: repository as CodexRepository } : {}),
    };
  }
  if (command === '/status') {
    const selector = argumentsList[0]?.toLowerCase();
    if (!selector) return { type: 'STATUS' };
    if (CODEX_REPOSITORIES.includes(selector as CodexRepository)) {
      return { type: 'STATUS', repository: selector as CodexRepository };
    }
    if (!TASK_ID_PATTERN.test(selector)) {
      return {
        type: 'INVALID',
        message: 'Cú pháp: /status [task-id|api|admin|client]. Task ID gồm 8 ký tự hex.',
      };
    }
    return { type: 'STATUS', taskId: selector };
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
    return {
      type: 'INVALID',
      message: [
        'Chưa tạo task vì thiếu nội dung công việc.',
        'Cú pháp: /task [api|admin|client] <yêu cầu chi tiết>',
        'Ví dụ: /task api Kiểm tra lỗi đăng nhập tài khoản admin',
      ].join('\n'),
    };
  }
  if (prompt.length > 4_000) {
    return { type: 'INVALID', message: 'Yêu cầu tối đa 4.000 ký tự.' };
  }
  return { type: 'TASK', repository, prompt };
}
