import type { GoogleMapsLinkInput } from './types';

/**
 * Build a Google Maps directions URL from origin, destination, and waypoints.
 */
export function getGoogleMapsLink(input: GoogleMapsLinkInput): string {
  const { origin, destination, places } = input;
  const originEnc = encodeURIComponent(origin);
  const destEnc = encodeURIComponent(destination);
  const waypointsParam = places
    .map((p) => encodeURIComponent(`${p.name} ${p.vicinity}`))
    .join('|');
  return `https://www.google.com/maps/dir/?api=1&origin=${originEnc}&destination=${destEnc}&waypoints=${waypointsParam}`;
}
