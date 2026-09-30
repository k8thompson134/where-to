/**
 * Select the route with the smallest duration (driving time).
 */
export function selectBestByDuration<T>(results: {
  duration: number;
  data: T;
}[]): { duration: number; data: T } | null {
  if (results.length === 0) return null;
  let best = results[0];
  for (const r of results.slice(1)) {
    if (r.duration < best.duration) best = r;
  }
  return best;
}
