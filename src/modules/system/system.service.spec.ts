import { SystemService } from './system.service';

describe('SystemService', () => {
  it('covers the reviewed 76-table V1 model', () => {
    const result = new SystemService().listModules();
    expect(result.totalModels).toBe(76);
    expect(result.p0Models).toBe(46);
    expect(result.p1Models).toBe(30);
    expect(new Set(result.items.flatMap((module) => module.tables)).size).toBe(76);
  });
});
