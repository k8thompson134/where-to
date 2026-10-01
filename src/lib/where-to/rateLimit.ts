/**
 * Fixed-window in-memory limiter. Per server instance only, so it caps bursts rather than global volume.
 */
export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const hits = new Map<string, { count: number; windowStart: number }>();
  return (key: string, now = Date.now()): boolean => {
    const entry = hits.get(key);
    if (!entry || now - entry.windowStart >= windowMs) {
      if (hits.size > 10_000) hits.clear();
      hits.set(key, { count: 1, windowStart: now });
      return true;
    }
    entry.count++;
    return entry.count <= limit;
  };
}
