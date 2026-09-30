import { describe, it, expect } from 'vitest';
import {
  pathDistanceMeters,
  sortCombinationsByPathDistance,
} from './routeSorting';
import type { Point } from './types';

describe('pathDistanceMeters', () => {
  it('returns 0 when start equals end and no waypoints', () => {
    const p: Point = { lat: 40, lng: -74 };
    expect(pathDistanceMeters(p, p, [])).toBe(0);
  });

  it('returns start-to-end distance when no waypoints', () => {
    const start: Point = { lat: 40.7, lng: -74 };
    const end: Point = { lat: 40.71, lng: -73.99 };
    const d = pathDistanceMeters(start, end, []);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(20000); // ~few km in meters
  });

  it('sums segments: start → wp → end', () => {
    const start: Point = { lat: 0, lng: 0 };
    const mid: Point = { lat: 1, lng: 0 };
    const end: Point = { lat: 2, lng: 0 };
    const d = pathDistanceMeters(start, end, [mid]);
    const segmentSum =
      pathDistanceMeters(start, mid, []) + pathDistanceMeters(mid, end, []);
    expect(d).toBeCloseTo(segmentSum, -2);
    const dDirect = pathDistanceMeters(start, end, []);
    expect(d).toBeGreaterThanOrEqual(dDirect);
  });

  it('off-route waypoint yields longer path than direct', () => {
    const start: Point = { lat: 43.04, lng: -87.91 };
    const end: Point = { lat: 43.05, lng: -87.88 };
    const onRoute: Point = { lat: 43.045, lng: -87.895 };
    const offRoute: Point = { lat: 42.5, lng: -88.5 };
    const dDirect = pathDistanceMeters(start, end, []);
    const dViaOn = pathDistanceMeters(start, end, [onRoute]);
    const dViaOff = pathDistanceMeters(start, end, [offRoute]);
    expect(dViaOn).toBeLessThanOrEqual(dDirect + 1000);
    expect(dViaOff).toBeGreaterThan(dDirect * 2);
  });
});

describe('sortCombinationsByPathDistance', () => {
  type Place = { id: string; lat: number; lng: number };

  const getPoint = (p: Place): Point => ({ lat: p.lat, lng: p.lng });

  it('sorts so on-route combinations come before off-route', () => {
    // Start (Milwaukee area) and End (nearby). On-route stop is along the line; off-route is far.
    const start: Point = { lat: 43.04, lng: -87.91 };
    const end: Point = { lat: 43.05, lng: -87.88 };

    const onRoute: Place = { id: 'on', lat: 43.045, lng: -87.895 }; // between start and end
    const offRoute: Place = { id: 'off', lat: 42.5, lng: -88.5 };   // far south/west

    const combos: Place[][] = [
      [offRoute],  // long path: start → off → end
      [onRoute],   // short path: start → on → end
    ];

    const sorted = sortCombinationsByPathDistance(start, end, combos, getPoint);
    expect(sorted).toHaveLength(2);
    expect(sorted[0][0].id).toBe('on');
    expect(sorted[1][0].id).toBe('off');
  });

  it('sorts two-waypoint combos by total path distance', () => {
    const start: Point = { lat: 0, lng: 0 };
    const end: Point = { lat: 10, lng: 0 };

    const near1: Place = { id: 'n1', lat: 2, lng: 0 };
    const near2: Place = { id: 'n2', lat: 8, lng: 0 };
    const far1: Place = { id: 'f1', lat: 5, lng: 10 };
    const far2: Place = { id: 'f2', lat: 5, lng: -10 };

    const combos: Place[][] = [
      [far1, far2],  // detour both ways
      [near1, near2], // along the path
      [near1, far2],
      [far1, near2],
    ];

    const sorted = sortCombinationsByPathDistance(start, end, combos, getPoint);
    expect(sorted[0].map((p) => p.id)).toEqual(['n1', 'n2']);
    expect(sorted[sorted.length - 1].map((p) => p.id)).toEqual(['f1', 'f2']);
  });

  it('does not mutate the original array', () => {
    const start: Point = { lat: 0, lng: 0 };
    const end: Point = { lat: 1, lng: 0 };
    const a: Place = { id: 'a', lat: 0.5, lng: 0 };
    const b: Place = { id: 'b', lat: 0.3, lng: 0 };
    const combos: Place[][] = [[a], [b]];
    const originalOrder = combos.map((c) => c[0].id);
    sortCombinationsByPathDistance(start, end, combos, getPoint);
    expect(combos.map((c) => c[0].id)).toEqual(originalOrder);
  });
});
