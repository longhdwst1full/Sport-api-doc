import {
  assertUniqueValues,
  DEMO_SEED_CONFIRMATION_FLAG,
  DEMO_SEED_REFRESH_DATA_FLAG,
  DEMO_SEED_REFRESH_MEDIA_FLAG,
  existingRecordUpdate,
  parseDemoSeedOptions,
} from '../../prisma/demo-data/seed-policy';

describe('manual demo seed policy', () => {
  it('rejects an accidental invocation without explicit confirmation', () => {
    expect(() => parseDemoSeedOptions([])).toThrow('Demo seed is manual-only');
  });

  it('uses create-only and media reuse defaults after explicit confirmation', () => {
    expect(parseDemoSeedOptions([DEMO_SEED_CONFIRMATION_FLAG])).toEqual({
      refreshData: false,
      refreshMedia: false,
    });
  });

  it('enables destructive refresh behavior only through explicit flags', () => {
    expect(parseDemoSeedOptions([
      DEMO_SEED_CONFIRMATION_FLAG,
      DEMO_SEED_REFRESH_DATA_FLAG,
      DEMO_SEED_REFRESH_MEDIA_FLAG,
    ])).toEqual({ refreshData: true, refreshMedia: true });
  });

  it('rejects unknown flags instead of silently choosing a mode', () => {
    expect(() => parseDemoSeedOptions([
      DEMO_SEED_CONFIRMATION_FLAG,
      '--reset-everything',
    ])).toThrow('Unknown demo seed option(s): --reset-everything');
  });

  it('preserves existing records unless refresh-data is enabled', () => {
    const desired = { amount: '12400000.00', status: 'PUBLISHED' };

    expect(existingRecordUpdate(false, desired)).toEqual({});
    expect(existingRecordUpdate(true, desired)).toEqual(desired);
  });

  it('rejects duplicate manifest business keys', () => {
    expect(() => assertUniqueValues(['SKU-1', 'SKU-2', 'SKU-1'], 'SKU'))
      .toThrow('Duplicate demo SKU: SKU-1');
  });
});
