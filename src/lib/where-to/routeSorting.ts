import type { Point } from './types';
import { getDistanceFromLatLonInM } from './distance';

/**
 * Total straight-line path distance in meters: start → waypoint[0] → ... → end.
 */
export function pathDistanceMeters(
  start: Point,
  end: Point,
  waypoints: Point[]
): number {
  let d = 0;
  let currentLat = start.lat;
  let currentLng = start.lng;
  for (const wp of waypoints) {
    d += getDistanceFromLatLonInM(currentLat, currentLng, wp.lat, wp.lng);
    currentLat = wp.lat;
    currentLng = wp.lng;
  }
  d += getDistanceFromLatLonInM(currentLat, currentLng, end.lat, end.lng);
  return d;
}

/**
 * Sort combinations by increasing path distance (start → w1 → … → end).
 * Puts "on-route" options first so we try them before off-route ones.
 */
export function sortCombinationsByPathDistance<T>(
  start: Point,
  end: Point,
  combinations: T[][],
  getPoint: (item: T) => Point
): T[][] {
  return [...combinations].sort((a, b) => {
    const pointsA = a.map(getPoint);
    const pointsB = b.map(getPoint);
    return (
      pathDistanceMeters(start, end, pointsA) -
      pathDistanceMeters(start, end, pointsB)
    );
  });
}
