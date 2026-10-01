/**
 * User-facing message for a Google Maps status or error code, or null when it just means "nothing found".
 * Covers the legacy service statuses and the RPC codes thrown by Places (New) and Routes.
 */
export function mapsErrorMessage(status: string): string | null {
  switch (status) {
    case 'OK':
    case 'ZERO_RESULTS':
    case 'NOT_FOUND':
      return null;
    case 'REQUEST_DENIED':
    case 'PERMISSION_DENIED':
    case 'UNAUTHENTICATED':
      return 'Google Maps rejected the request (API key or billing problem). Please try again later.';
    case 'OVER_QUERY_LIMIT':
    case 'RESOURCE_EXHAUSTED':
      return 'Google Maps usage limit reached. Wait a minute and try again.';
    case 'MAX_WAYPOINTS_EXCEEDED':
      return 'Too many stops for one route. Remove a stop and try again.';
    default:
      return `Google Maps had a problem (${status}). Please try again.`;
  }
}
