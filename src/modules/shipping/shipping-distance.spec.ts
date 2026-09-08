import { distanceKm } from './shipping-distance';

describe('distanceKm', () => {
  it('returns zero for the same coordinate and a realistic HCM short distance', () => {
    expect(distanceKm({ latitude: 10.7769, longitude: 106.7009 }, { latitude: 10.7769, longitude: 106.7009 })).toBe(0);
    expect(distanceKm({ latitude: 10.7769, longitude: 106.7009 }, { latitude: 10.8231, longitude: 106.6297 })).toBeGreaterThan(8);
  });
});
