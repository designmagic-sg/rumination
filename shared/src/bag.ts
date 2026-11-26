import { ITEMS, type ItemId } from './items';

export interface Stack {
  item: ItemId;
  count: number;
}
export type Slot = Stack | null;

export const BAG_SIZE = 24;
/** Slots 0–8 are the toolbar. */
export const TOOLBAR_SIZE = 9;
export const STARTING_RUMIS = 50;

const okCount = (n: number) => Number.isInteger(n) && n > 0;
const okSlot = (i: number) => Number.isInteger(i) && i >= 0 && i < BAG_SIZE;

export function newBag(): Slot[] {
  const bag: Slot[] = Array.from({ length: BAG_SIZE }, () => null);
  bag[0] = { item: 'hoe', count: 1 };
  bag[1] = { item: 'can', count: 1 };
  bag[2] = { item: 'seed-turnip', count: 10 };
  return bag;
}

/** Adds items, filling existing stacks first. Null (nothing changed) if they don't all fit. */
export function addItem(bag: Slot[], item: ItemId, count: number): Slot[] | null {
  if (!okCount(count)) return null;
  const max = ITEMS[item].stack;
  const out = bag.map(s => (s ? { ...s } : null));
  let left = count;
  for (const s of out) {
    if (left === 0) break;
    if (s && s.item === item && s.count < max) {
      const n = Math.min(max - s.count, left);
      s.count += n;
      left -= n;
    }
  }
  for (let i = 0; i < out.length && left > 0; i++) {
    if (!out[i]) {
      const n = Math.min(max, left);
      out[i] = { item, count: n };
      left -= n;
    }
  }
  return left === 0 ? out : null;
}

export function canAdd(bag: Slot[], item: ItemId, count: number): boolean {
  return addItem(bag, item, count) !== null;
}

export function removeItem(bag: Slot[], slot: number, count: number): Slot[] | null {
  if (!okSlot(slot) || !okCount(count)) return null;
  const s = bag[slot];
  if (!s || s.count < count) return null;
  const out = bag.slice();
  out[slot] = s.count === count ? null : { ...s, count: s.count - count };
  return out;
}

export function countOf(bag: Slot[], item: ItemId): number {
  return bag.reduce((n, s) => n + (s && s.item === item ? s.count : 0), 0);
}

export function swapSlots(bag: Slot[], a: number, b: number): Slot[] | null {
  if (!okSlot(a) || !okSlot(b)) return null;
  const out = bag.slice();
  [out[a], out[b]] = [out[b]!, out[a]!];
  return out;
}

/** A bag read from a save or a message: keeps only well-formed stacks, padded to BAG_SIZE. */
export function cleanBag(raw: unknown): Slot[] | null {
  if (!Array.isArray(raw)) return null;
  const out: Slot[] = Array.from({ length: BAG_SIZE }, () => null);
  raw.slice(0, BAG_SIZE).forEach((s, i) => {
    if (s && typeof s === 'object' && Object.hasOwn(ITEMS, s.item) && okCount(s.count)) {
      out[i] = { item: s.item, count: Math.min(s.count, ITEMS[s.item as ItemId].stack) };
    }
  });
  return out;
}
