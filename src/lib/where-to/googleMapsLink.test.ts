import { describe, it, expect } from 'vitest';
import { getGoogleMapsLink } from './googleMapsLink';

describe('getGoogleMapsLink', () => {
  it('includes origin and destination in URL', () => {
    const url = getGoogleMapsLink({
      origin: '123 Main St',
      destination: '456 Oak Ave',
      places: [],
    });
    expect(url).toContain('api=1');
    expect(url).toContain(encodeURIComponent('123 Main St'));
    expect(url).toContain(encodeURIComponent('456 Oak Ave'));
    expect(url).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\/\?/);
  });

  it('includes waypoints when provided', () => {
    const url = getGoogleMapsLink({
      origin: 'A',
      destination: 'B',
      places: [
        { name: 'Coffee Shop', vicinity: '1 First St' },
        { name: 'Bank', vicinity: '2 Second St' },
      ],
    });
    expect(url).toContain('waypoints=');
    expect(url).toContain(encodeURIComponent('Coffee Shop 1 First St'));
    expect(url).toContain(encodeURIComponent('Bank 2 Second St'));
  });

  it('produces a valid URL', () => {
    const url = getGoogleMapsLink({
      origin: 'Start',
      destination: 'End',
      places: [{ name: 'Stop', vicinity: 'Middle' }],
    });
    expect(() => new URL(url)).not.toThrow();
  });
});
