/** Friendly 4-letter words for world codes like MOON-4823. */
export const CODE_WORDS: readonly string[] = [
  'MOON', 'LEAF', 'BELL', 'FERN', 'PEAR', 'PLUM', 'JADE', 'RUBY', 'STAR', 'SEED',
  'RAIN', 'LAKE', 'ROSE', 'SAGE', 'WREN', 'DUSK', 'DAWN', 'MINT', 'GLOW', 'TIDE',
  'COVE', 'NEST', 'PINE', 'BEAN', 'KALE', 'CORN', 'MOSS', 'REED', 'HIVE', 'DOVE',
  'LARK', 'FAWN', 'BEAR', 'WOLF', 'FROG', 'CRAB', 'PEAK', 'VALE', 'HILL', 'MIST',
  'SNOW', 'SOIL', 'LILY', 'IRIS', 'OPAL', 'GOLD', 'ROOT', 'BARN', 'POND', 'WAVE',
];

/** Digits that are hard to mix up with letters (no 0 or 1). */
const DIGITS = '23456789';

export function generateCode(random: () => number = Math.random): string {
  const pick = (n: number) => Math.min(n - 1, Math.floor(random() * n));
  const word = CODE_WORDS[pick(CODE_WORDS.length)]!;
  let digits = '';
  for (let i = 0; i < 4; i++) digits += DIGITS[pick(DIGITS.length)];
  return `${word}-${digits}`;
}

/** Accepts any case, spaces, dashes (including en dashes) or none. Returns WORD-1234 or null. */
export function normalizeCode(input: string): string | null {
  const compact = input.toUpperCase().replace(/[\s\-‐-―]/g, '');
  const m = /^([A-Z]{4})([2-9]{4})$/.exec(compact);
  return m ? `${m[1]}-${m[2]}` : null;
}

export const NICKNAME_MAX = 16;

/** Trims, collapses spaces, strips control characters and caps the length. Null if nothing is left. */
export function cleanNickname(input: string): string | null {
  const cleaned = input
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  return [...cleaned].slice(0, NICKNAME_MAX).join('').trim();
}
