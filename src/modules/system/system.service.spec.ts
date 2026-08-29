import { SystemService } from './system.service';

describe('SystemService', () => {
  it('covers the reviewed 74-table V1 model', () => {
    const result = new SystemService().listModules();
    expect(result.totalModels).toBe(74);
    expect(result.p0Models).toBe(43);
    expect(result.p1Models).toBe(31);
    expect(new Set(result.items.flatMap((module) => module.tables)).size).toBe(74);
  });
});
