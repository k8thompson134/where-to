import type { Point } from './types';
import { getDistanceFromLatLonInM } from './distance';

/**
 * Keep items within maxMeters of center; Places text search only biases by location, so far matches can leak in.
 */
export function filterByDistance<T>(
  items: T[],
  center: Point,
  maxMeters: number,
  getPoint: (item: T) => Point
): T[] {
  return items.filter((item) => {
    const p = getPoint(item);
    return getDistanceFromLatLonInM(center.lat, center.lng, p.lat, p.lng) <= maxMeters;
  });
}
