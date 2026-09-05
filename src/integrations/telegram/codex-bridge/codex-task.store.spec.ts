import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexTaskStore } from './codex-task.store';
import { CODEX_TASK_STATUS, type CodexTask } from './codex-task.types';

function task(id: string): CodexTask {
  return {
    id,
    repository: 'api',
    prompt: `Task ${id}`,
    chatId: 1,
    requestedBy: 1,
    status: CODEX_TASK_STATUS.PENDING_CONFIRMATION,
    createdAt: '2026-09-05T00:00:00.000Z',
  };
}

describe('CodexTaskStore', () => {
  let directory: string;
  let store: CodexTaskStore;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'codex-store-test-'));
    store = new CodexTaskStore(join(directory, 'state.json'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('starts empty and persists task state as private JSON', async () => {
    await expect(store.load()).resolves.toEqual({ nextUpdateOffset: 0, tasks: [] });
    await store.mutate((state) => state.tasks.push(task('abcdef12')));

    await expect(store.find('abcdef12')).resolves.toMatchObject({ repository: 'api' });
    expect(await readFile(join(directory, 'state.json'), 'utf8')).toContain('abcdef12');
  });

  it('serializes concurrent mutations without losing tasks', async () => {
    await Promise.all([
      store.mutate((state) => state.tasks.push(task('aaaaaaaa'))),
      store.mutate((state) => state.tasks.push(task('bbbbbbbb'))),
    ]);

    const state = await store.load();
    expect(state.tasks.map((item) => item.id)).toEqual(['aaaaaaaa', 'bbbbbbbb']);
  });
});
