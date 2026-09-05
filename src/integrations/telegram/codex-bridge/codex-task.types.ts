export const CODEX_REPOSITORIES = ['api', 'admin', 'client'] as const;
export type CodexRepository = (typeof CODEX_REPOSITORIES)[number];

export const CODEX_TASK_STATUS = {
  PENDING_CONFIRMATION: 'PENDING_CONFIRMATION',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;

export type CodexTaskStatus = (typeof CODEX_TASK_STATUS)[keyof typeof CODEX_TASK_STATUS];

export interface CodexTask {
  id: string;
  repository: CodexRepository;
  prompt: string;
  chatId: number;
  requestedBy: number;
  status: CodexTaskStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  summary?: string;
  error?: string;
}

export interface CodexWorkerState {
  nextUpdateOffset: number;
  tasks: CodexTask[];
}
