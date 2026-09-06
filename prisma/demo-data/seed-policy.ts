export const DEMO_SEED_CONFIRMATION_FLAG = '--confirm-manual-seed';
export const DEMO_SEED_REFRESH_DATA_FLAG = '--refresh-data';
export const DEMO_SEED_REFRESH_MEDIA_FLAG = '--refresh-media';

export interface DemoSeedOptions {
  refreshData: boolean;
  refreshMedia: boolean;
}

const allowedFlags = new Set([
  DEMO_SEED_CONFIRMATION_FLAG,
  DEMO_SEED_REFRESH_DATA_FLAG,
  DEMO_SEED_REFRESH_MEDIA_FLAG,
]);

export function parseDemoSeedOptions(arguments_: readonly string[]): DemoSeedOptions {
  const unknownFlags = arguments_.filter((argument) => argument.startsWith('--') && !allowedFlags.has(argument));
  if (unknownFlags.length > 0) {
    throw new Error(`Unknown demo seed option(s): ${unknownFlags.join(', ')}`);
  }
  if (!arguments_.includes(DEMO_SEED_CONFIRMATION_FLAG)) {
    throw new Error(
      `Demo seed is manual-only. Run it only with explicit approval and ${DEMO_SEED_CONFIRMATION_FLAG}.`,
    );
  }
  return {
    refreshData: arguments_.includes(DEMO_SEED_REFRESH_DATA_FLAG),
    refreshMedia: arguments_.includes(DEMO_SEED_REFRESH_MEDIA_FLAG),
  };
}

export function existingRecordUpdate<T extends object>(refresh: boolean, data: T): Partial<T> {
  return refresh ? data : {};
}

export function assertUniqueValues(values: readonly string[], field: string): void {
  const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
  if (duplicates.length > 0) {
    throw new Error(`Duplicate demo ${field}: ${[...new Set(duplicates)].join(', ')}`);
  }
}
