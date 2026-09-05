import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { CodexTask, CodexWorkerState } from './codex-task.types';

const EMPTY_STATE: CodexWorkerState = { nextUpdateOffset: 0, tasks: [] };

export class CodexTaskStore {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async load(): Promise<CodexWorkerState> {
    try {
      return JSON.parse(await readFile(this.filePath, 'utf8')) as CodexWorkerState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return structuredClone(EMPTY_STATE);
      throw error;
    }
  }

  async save(state: CodexWorkerState): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    await rename(temporaryPath, this.filePath);
  }

  async mutate(mutator: (state: CodexWorkerState) => void): Promise<CodexWorkerState> {
    let result = structuredClone(EMPTY_STATE);
    this.writeQueue = this.writeQueue.then(async () => {
      result = await this.load();
      mutator(result);
      result.tasks = result.tasks.slice(-50);
      await this.save(result);
    });
    await this.writeQueue;
    return result;
  }

  async find(taskId: string): Promise<CodexTask | undefined> {
    await this.writeQueue;
    return (await this.load()).tasks.find((task) => task.id === taskId);
  }
}
