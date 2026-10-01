import { describe, it, expect } from 'vitest';
import { mapsErrorMessage } from './mapsStatus';

describe('mapsErrorMessage', () => {
  it('returns null for statuses that just mean nothing was found', () => {
    expect(mapsErrorMessage('OK')).toBeNull();
    expect(mapsErrorMessage('ZERO_RESULTS')).toBeNull();
    expect(mapsErrorMessage('NOT_FOUND')).toBeNull();
  });

  it('explains key/billing and quota failures distinctly', () => {
    expect(mapsErrorMessage('REQUEST_DENIED')).toMatch(/API key or billing/);
    expect(mapsErrorMessage('OVER_QUERY_LIMIT')).toMatch(/usage limit/);
  });

  it('includes the raw status for anything else', () => {
    expect(mapsErrorMessage('UNKNOWN_ERROR')).toContain('UNKNOWN_ERROR');
  });
});
