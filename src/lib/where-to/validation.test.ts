import { describe, it, expect } from 'vitest';
import { validateSearchParams } from './validation';

describe('validateSearchParams', () => {
  it('returns error when start query is empty', () => {
    const result = validateSearchParams({
      startQuery: '',
      endQuery: 'End',
      sameStartEnd: false,
      waypoints: [{ id: 1, value: 'coffee' }],
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('starting');
  });

  it('returns error when end is empty and not same start/end', () => {
    const result = validateSearchParams({
      startQuery: 'Start',
      endQuery: '',
      sameStartEnd: false,
      waypoints: [{ id: 1, value: 'coffee' }],
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('ending');
  });

  it('passes when same start and end and only start is set', () => {
    const result = validateSearchParams({
      startQuery: 'Home',
      endQuery: '',
      sameStartEnd: true,
      waypoints: [{ id: 1, value: 'coffee' }],
    });
    expect(result.valid).toBe(true);
  });

  it('returns error when no waypoints have value', () => {
    const result = validateSearchParams({
      startQuery: 'Start',
      endQuery: 'End',
      sameStartEnd: false,
      waypoints: [{ id: 1, value: '' }, { id: 2, value: '   ' }],
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('one stop');
  });

  it('passes with one filled waypoint', () => {
    const result = validateSearchParams({
      startQuery: 'Start',
      endQuery: 'End',
      sameStartEnd: false,
      waypoints: [{ id: 1, value: 'coffee' }, { id: 2, value: '' }],
    });
    expect(result.valid).toBe(true);
  });
});
