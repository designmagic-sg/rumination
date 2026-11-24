/** A simple fixed-window rate limiter, per key (an IP address). */
export function createLimiter(opts: { limit: number; windowMs: number; now?: () => number }) {
  const now = opts.now ?? Date.now;
  const windows = new Map<string, { start: number; count: number }>();
  return {
    /** Records one attempt; false once this key is over its limit for the current window. */
    hit(key: string): boolean {
      const t = now();
      let w = windows.get(key);
      if (!w || t - w.start > opts.windowMs) {
        w = { start: t, count: 0 };
        windows.set(key, w);
        if (windows.size > 10_000) for (const [k, v] of windows) if (t - v.start > opts.windowMs) windows.delete(k);
      }
      w.count++;
      return w.count <= opts.limit;
    },
  };
}
export type Limiter = ReturnType<typeof createLimiter>;
