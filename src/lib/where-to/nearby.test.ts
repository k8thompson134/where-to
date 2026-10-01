import { describe, it, expect } from 'vitest';
import { filterByDistance } from './nearby';

const milwaukee = { lat: 43.0389, lng: -87.9065 };

describe('filterByDistance', () => {
  it('drops items outside the radius', () => {
    const items = [
      { name: 'Third Ward', p: { lat: 43.0333, lng: -87.9091 } },
      { name: 'St. Peters, MO', p: { lat: 38.8003, lng: -90.6265 } },
    ];
    const kept = filterByDistance(items, milwaukee, 50_000, (i) => i.p);
    expect(kept.map((i) => i.name)).toEqual(['Third Ward']);
  });
});
