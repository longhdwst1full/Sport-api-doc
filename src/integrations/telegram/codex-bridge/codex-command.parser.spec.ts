import { parseCodexBotCommand } from './codex-command.parser';

describe('parseCodexBotCommand', () => {
  it('uses the configured repository when /task omits a repository', () => {
    expect(parseCodexBotCommand('/task Rà soát module auth', 'api')).toEqual({
      type: 'TASK',
      repository: 'api',
      prompt: 'Rà soát module auth',
    });
  });

  it('accepts one of the fixed repository aliases', () => {
    expect(parseCodexBotCommand('/task admin Hoàn thiện màn hình role', 'api')).toEqual({
      type: 'TASK',
      repository: 'admin',
      prompt: 'Hoàn thiện màn hình role',
    });
  });

  it('parses confirmation and status task IDs case-insensitively', () => {
    expect(parseCodexBotCommand('/confirm ABCD1234', 'api')).toEqual({
      type: 'CONFIRM',
      taskId: 'abcd1234',
    });
    expect(parseCodexBotCommand('/status abcd1234', 'api')).toEqual({
      type: 'STATUS',
      taskId: 'abcd1234',
    });
  });

  it('rejects malformed IDs, short prompts, and unsupported commands', () => {
    expect(parseCodexBotCommand('/confirm ../../api', 'api').type).toBe('INVALID');
    expect(parseCodexBotCommand('/task api fix', 'api').type).toBe('INVALID');
    expect(parseCodexBotCommand('/shell rm -rf x', 'api').type).toBe('INVALID');
  });
});
