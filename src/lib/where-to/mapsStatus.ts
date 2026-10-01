/**
 * User-facing message for a non-OK Google Maps status, or null when the status just means "nothing found".
 */
export function mapsErrorMessage(status: string): string | null {
  switch (status) {
    case 'OK':
    case 'ZERO_RESULTS':
    case 'NOT_FOUND':
      return null;
    case 'REQUEST_DENIED':
      return 'Google Maps rejected the request (API key or billing problem). Please try again later.';
    case 'OVER_QUERY_LIMIT':
      return 'Google Maps usage limit reached. Wait a minute and try again.';
    case 'MAX_WAYPOINTS_EXCEEDED':
      return 'Too many stops for one route. Remove a stop and try again.';
    default:
      return `Google Maps had a problem (${status}). Please try again.`;
  }
}
