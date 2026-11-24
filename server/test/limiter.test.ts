import { describe, expect, it } from 'vitest';
import { createLimiter } from '../src/limiter';

describe('createLimiter', () => {
  it('allows up to the limit per window, then refuses', () => {
    let now = 0;
    const l = createLimiter({ limit: 3, windowMs: 60_000, now: () => now });
    expect([l.hit('a'), l.hit('a'), l.hit('a'), l.hit('a')]).toEqual([true, true, true, false]);
  });

  it('counts each key separately', () => {
    const l = createLimiter({ limit: 1, windowMs: 60_000, now: () => 0 });
    expect(l.hit('a')).toBe(true);
    expect(l.hit('b')).toBe(true);
    expect(l.hit('a')).toBe(false);
  });

  it('starts afresh after the window', () => {
    let now = 0;
    const l = createLimiter({ limit: 1, windowMs: 60_000, now: () => now });
    l.hit('a');
    now = 60_001;
    expect(l.hit('a')).toBe(true);
  });
});
