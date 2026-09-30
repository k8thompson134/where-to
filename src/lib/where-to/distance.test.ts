import { describe, it, expect } from 'vitest';
import { getDistanceFromLatLonInM } from './distance';

describe('getDistanceFromLatLonInM', () => {
  it('returns 0 for same point', () => {
    expect(getDistanceFromLatLonInM(40.7, -74, 40.7, -74)).toBe(0);
  });

  it('returns positive distance for two different points', () => {
    const d = getDistanceFromLatLonInM(40.7, -74, 41.0, -73.5);
    expect(d).toBeGreaterThan(0);
    expect(Number.isFinite(d)).toBe(true);
  });

  it('roughly matches known distance (NYC to Boston ~306 km)', () => {
    // NYC ~ 40.71, -74.00; Boston ~ 42.36, -71.06
    const d = getDistanceFromLatLonInM(40.71, -74.0, 42.36, -71.06);
    const km = d / 1000;
    expect(km).toBeGreaterThan(250);
    expect(km).toBeLessThan(350);
  });
});
