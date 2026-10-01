import { describe, it, expect } from 'vitest';
import { parseFilterRequest, FILTER_LIMITS } from './filterRequest';

const place = { name: 'Starbucks', types: ['cafe'], vicinity: '1 Main St' };

describe('parseFilterRequest', () => {
  it('accepts a valid body', () => {
    expect(parseFilterRequest({ userQuery: 'coffee', places: [place] })).toEqual({
      ok: true,
      userQuery: 'coffee',
      places: [place],
    });
  });

  it('treats missing places as an empty list', () => {
    expect(parseFilterRequest({ userQuery: 'coffee' })).toEqual({ ok: true, userQuery: 'coffee', places: [] });
  });

  it('rejects a missing or blank query', () => {
    expect(parseFilterRequest({ places: [place] }).ok).toBe(false);
    expect(parseFilterRequest({ userQuery: '  ', places: [place] }).ok).toBe(false);
  });

  it('rejects an overlong query', () => {
    expect(parseFilterRequest({ userQuery: 'x'.repeat(FILTER_LIMITS.maxQueryLength + 1) }).ok).toBe(false);
  });

  it('rejects too many places', () => {
    const places = Array.from({ length: FILTER_LIMITS.maxPlaces + 1 }, () => place);
    expect(parseFilterRequest({ userQuery: 'coffee', places }).ok).toBe(false);
  });

  it('rejects malformed places', () => {
    expect(parseFilterRequest({ userQuery: 'coffee', places: [{ name: 5 }] }).ok).toBe(false);
    expect(parseFilterRequest({ userQuery: 'coffee', places: [{ name: 'x'.repeat(FILTER_LIMITS.maxNameLength + 1) }] }).ok).toBe(false);
    expect(parseFilterRequest({ userQuery: 'coffee', places: [{ name: 'A', types: 'cafe' }] }).ok).toBe(false);
    expect(parseFilterRequest({ userQuery: 'coffee', places: [{ name: 'A', vicinity: 7 }] }).ok).toBe(false);
    expect(parseFilterRequest({ userQuery: 'coffee', places: [null] }).ok).toBe(false);
  });

  it('rejects non-object bodies', () => {
    expect(parseFilterRequest(null).ok).toBe(false);
    expect(parseFilterRequest('coffee').ok).toBe(false);
  });
});
