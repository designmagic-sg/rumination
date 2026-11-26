import { describe, expect, it } from 'vitest';
import { BAG_SIZE, STARTING_RUMIS, addItem, canAdd, countOf, newBag, removeItem, swapSlots, type Slot } from '../src/bag';

const empty = (): Slot[] => Array.from({ length: BAG_SIZE }, () => null);

describe('bag', () => {
  it('starts with a hoe, a can and 10 turnip seeds', () => {
    const b = newBag();
    expect(b).toHaveLength(24);
    expect(b.slice(0, 3)).toEqual([{ item: 'hoe', count: 1 }, { item: 'can', count: 1 }, { item: 'seed-turnip', count: 10 }]);
    expect(STARTING_RUMIS).toBe(50);
  });
  it('stacks to 99 and then spills into the next empty slot', () => {
    let b = addItem(empty(), 'turnip', 95)!;
    b = addItem(b, 'turnip', 10)!;
    expect(b[0]).toEqual({ item: 'turnip', count: 99 });
    expect(b[1]).toEqual({ item: 'turnip', count: 6 });
    expect(countOf(b, 'turnip')).toBe(105);
  });
  it('never stacks tools', () => {
    const b = addItem(addItem(empty(), 'hoe', 1)!, 'hoe', 1)!;
    expect(b[0]).toEqual({ item: 'hoe', count: 1 });
    expect(b[1]).toEqual({ item: 'hoe', count: 1 });
  });
  it('refuses, unchanged, when it can not all fit', () => {
    const full = Array.from({ length: BAG_SIZE }, () => ({ item: 'hoe' as const, count: 1 }));
    expect(canAdd(full, 'turnip', 1)).toBe(false);
    expect(addItem(full, 'turnip', 1)).toBeNull();
    expect(full[0]).toEqual({ item: 'hoe', count: 1 });
  });
  it('removes from a slot and clears it when empty', () => {
    const b = addItem(empty(), 'carrot', 3)!;
    expect(removeItem(b, 0, 2)![0]).toEqual({ item: 'carrot', count: 1 });
    expect(removeItem(b, 0, 3)![0]).toBeNull();
    expect(removeItem(b, 0, 4)).toBeNull();
    expect(removeItem(b, 5, 1)).toBeNull();
    expect(removeItem(b, 0, 0)).toBeNull();
    expect(removeItem(b, 0, 1.5)).toBeNull();
  });
  it('swaps slots and refuses bad indices', () => {
    const b = newBag();
    expect(swapSlots(b, 0, 5)![5]).toEqual({ item: 'hoe', count: 1 });
    expect(swapSlots(b, 0, 24)).toBeNull();
    expect(swapSlots(b, -1, 2)).toBeNull();
    expect(swapSlots(b, 0.5, 2)).toBeNull();
  });
  it('rejects nonsense counts', () => {
    expect(addItem(empty(), 'turnip', 0)).toBeNull();
    expect(addItem(empty(), 'turnip', -3)).toBeNull();
    expect(addItem(empty(), 'turnip', 2.5)).toBeNull();
  });
});
