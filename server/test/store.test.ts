import { describe, expect, it } from 'vitest';
import { openStore } from '../src/store';

const KEY = 'a'.repeat(32);

describe('WorldStore', () => {
  it('round-trips a created world', () => {
    const store = openStore(':memory:');
    const w = store.createWorld('Cosy Patch', KEY);
    expect(w.code).toMatch(/^[A-Z]{4}-[2-9]{4}$/);
    expect(store.load(w.code)).toEqual(w);
    expect(store.exists(w.code)).toBe(true);
  });

  it('gives every world a different code', () => {
    const store = openStore(':memory:');
    const codes = new Set(Array.from({ length: 200 }, () => store.createWorld('W', KEY).code));
    expect(codes.size).toBe(200);
  });

  it('returns null for an unknown code', () => {
    expect(openStore(':memory:').load('NOPE-2222')).toBeNull();
  });

  it('saves changes and bumps updated_at', async () => {
    const store = openStore(':memory:');
    const w = store.createWorld('W', KEY);
    const before = store.updatedAt(w.code)!;
    await new Promise(r => setTimeout(r, 5));
    store.save({ ...w, clock: { day: 2, minute: 400 } });
    expect(store.load(w.code)!.clock).toEqual({ day: 2, minute: 400 });
    expect(store.updatedAt(w.code)!).toBeGreaterThan(before);
  });
});

describe('WorldStore code space', () => {
  it('gives up with NO_FREE_CODES instead of looping forever when codes run out', () => {
    const store = openStore(':memory:', () => 'MOON-2222');
    store.createWorld('First', KEY);
    expect(() => store.createWorld('Second', KEY)).toThrow('NO_FREE_CODES');
  });
});
