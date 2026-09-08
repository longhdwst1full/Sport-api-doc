import { SystemService } from './system.service';

describe('SystemService', () => {
  it('covers the reviewed 75-table V1 model', () => {
    const result = new SystemService().listModules();
    expect(result.totalModels).toBe(75);
    expect(result.p0Models).toBe(45);
    expect(result.p1Models).toBe(30);
    expect(new Set(result.items.flatMap((module) => module.tables)).size).toBe(75);
  });
});
