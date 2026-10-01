import { describe, it, expect } from 'vitest';
import { createRateLimiter } from './rateLimit';

describe('createRateLimiter', () => {
  it('allows up to the limit per window, then blocks', () => {
    const allow = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect(allow('a', 0)).toBe(true);
    expect(allow('a', 10)).toBe(true);
    expect(allow('a', 20)).toBe(false);
  });

  it('tracks keys separately', () => {
    const allow = createRateLimiter({ limit: 1, windowMs: 1000 });
    expect(allow('a', 0)).toBe(true);
    expect(allow('b', 0)).toBe(true);
    expect(allow('a', 1)).toBe(false);
  });

  it('resets after the window', () => {
    const allow = createRateLimiter({ limit: 1, windowMs: 1000 });
    expect(allow('a', 0)).toBe(true);
    expect(allow('a', 500)).toBe(false);
    expect(allow('a', 1000)).toBe(true);
  });
});
