import { describe, expect, it } from 'vitest';
import { CODE_WORDS, cleanNickname, generateCode, normalizeCode } from '../src/codes';

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('generateCode', () => {
  it('makes WORD-2345 codes from the word list and digits 2–9', () => {
    const rnd = seeded(42);
    for (let i = 0; i < 1000; i++) {
      const code = generateCode(rnd);
      expect(code).toMatch(/^[A-Z]{4}-[2-9]{4}$/);
      expect(CODE_WORDS).toContain(code.slice(0, 4));
    }
  });

  it('has at least 40 four-letter uppercase words', () => {
    expect(CODE_WORDS.length).toBeGreaterThanOrEqual(40);
    for (const w of CODE_WORDS) expect(w).toMatch(/^[A-Z]{4}$/);
  });
});

describe('normalizeCode', () => {
  it.each(['moon 4823', ' Moon-4823 ', 'MOON4823', 'moon–4823'])('accepts %j', input => {
    expect(normalizeCode(input)).toBe('MOON-4823');
  });

  it.each(['MOO-4823', 'MOON-1821', 'MOON-48231', ''])('rejects %j', input => {
    expect(normalizeCode(input)).toBeNull();
  });
});

describe('cleanNickname', () => {
  it('trims', () => expect(cleanNickname('  Aris  ')).toBe('Aris'));
  it('caps at 16 characters', () => expect(cleanNickname('a'.repeat(30))).toHaveLength(16));
  it('rejects control characters only', () => expect(cleanNickname('\u0000\u0007')).toBeNull());
  it('collapses inner spaces', () => expect(cleanNickname('Big   Bear')).toBe('Big Bear'));
});
