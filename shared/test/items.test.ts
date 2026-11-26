import { describe, expect, it } from 'vitest';
import { CROPS, ITEMS, isItemId, type CropId } from '../src/items';

const crops = Object.keys(CROPS) as CropId[];

describe('items', () => {
  it('has a seed item and a crop item for every crop', () => {
    for (const c of crops) {
      expect(ITEMS[`seed-${c}`].kind).toBe('seed');
      expect(ITEMS[c].kind).toBe('crop');
    }
  });
  it('sells every crop for more than its seed costs, except the regrowing strawberry', () => {
    for (const c of crops) if (c !== 'strawberry') expect(CROPS[c].sellPrice).toBeGreaterThan(CROPS[c].seedPrice);
    expect(CROPS.strawberry.regrowDays).toBe(3);
  });
  it('gives every item its own icon', () => {
    const icons = Object.values(ITEMS).map(i => i.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });
  it('never stacks tools', () => {
    expect(ITEMS.hoe.stack).toBe(1);
    expect(ITEMS.can.stack).toBe(1);
    expect(ITEMS['seed-turnip'].stack).toBe(99);
  });
  it('recognises item ids', () => {
    expect(isItemId('seed-carrot')).toBe(true);
    expect(isItemId('seed-rafflesia')).toBe(false);
    expect(isItemId(42)).toBe(false);
  });
});
