import { describe, it, expect } from 'vitest';
import { selectBestByDuration } from './routeSelection';

describe('selectBestByDuration', () => {
  it('returns null for empty array', () => {
    expect(selectBestByDuration([])).toBeNull();
  });

  it('returns the only result when one element', () => {
    const result = selectBestByDuration([{ duration: 3600, data: 'only' }]);
    expect(result).toEqual({ duration: 3600, data: 'only' });
  });

  it('picks the route with minimum duration', () => {
    const results = [
      { duration: 4200, data: 'routeA' },
      { duration: 3600, data: 'routeB' },
      { duration: 3900, data: 'routeC' },
    ];
    const best = selectBestByDuration(results);
    expect(best?.duration).toBe(3600);
    expect(best?.data).toBe('routeB');
  });

  it('picks first when multiple have same min duration', () => {
    const results = [
      { duration: 3600, data: 'first' },
      { duration: 3600, data: 'second' },
      { duration: 4000, data: 'third' },
    ];
    const best = selectBestByDuration(results);
    expect(best?.duration).toBe(3600);
    expect(best?.data).toBe('first');
  });

  it('works with payload objects (e.g. route + places)', () => {
    const results = [
      { duration: 1800, data: { places: ['A', 'B'], label: 'fast' } },
      { duration: 2400, data: { places: ['A', 'C'], label: 'slow' } },
    ];
    const best = selectBestByDuration(results);
    expect(best?.duration).toBe(1800);
    expect(best?.data.label).toBe('fast');
    expect(best?.data.places).toEqual(['A', 'B']);
  });
});
