export interface MigrationExecutionDecision {
  shouldRun: boolean;
  mode: string;
  reason: string;
}

export function resolveMigrationExecution(
  argv: string[],
  environment: Record<string, string | undefined>,
): MigrationExecutionDecision;
