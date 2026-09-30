export interface SearchParams {
  startQuery: string;
  endQuery: string;
  sameStartEnd: boolean;
  waypoints: { id: number; value: string }[];
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate search form inputs before running the search.
 */
export function validateSearchParams(params: SearchParams): ValidationResult {
  if (!params.startQuery?.trim()) {
    return { valid: false, error: 'Please enter a starting location' };
  }
  const finalEnd = params.sameStartEnd ? params.startQuery : params.endQuery;
  if (!params.sameStartEnd && !finalEnd?.trim()) {
    return { valid: false, error: 'Please enter an ending location' };
  }
  const activeWaypoints = params.waypoints.filter((w) => w.value.trim().length > 0);
  if (activeWaypoints.length === 0) {
    return { valid: false, error: 'Please enter at least one stop' };
  }
  return { valid: true };
}
