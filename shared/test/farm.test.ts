import { describe, expect, it } from 'vitest';
import { catchUp, cropStage, harvest, nextDay, plant, till, water, type Farm } from '../src/farm';
import { ZONES } from '../src/maps';

const farmZone = ZONES.farm;
// A plot tile: the first ':' in the farm map.
const py = farmZone.rows.findIndex(r => r.includes(':'));
const px = farmZone.rows[py]!.indexOf(':');
const DAY_MS = 24 * 60 * 1000;

const grown = (farm: Farm, days: number) => {
  let f = farm;
  for (let i = 0; i < days; i++) f = nextDay(water(f, px, py)!);
  return f;
};

describe('farm', () => {
  it('only tills empty farm-plot tiles', () => {
    const f = till({}, farmZone, px, py)!;
    expect(f[`${px},${py}`]).toEqual({ watered: false, crop: null });
    expect(till(f, farmZone, px, py)).toBeNull();
    expect(till({}, farmZone, 1, 1)).toBeNull(); // bush border
    expect(till({}, ZONES.market, 5, 10)).toBeNull();
  });
  it('waters and plants only on tilled soil', () => {
    expect(water({}, px, py)).toBeNull();
    expect(plant({}, px, py, 'turnip')).toBeNull();
    const f = plant(till({}, farmZone, px, py)!, px, py, 'turnip')!;
    expect(f[`${px},${py}`]!.crop).toEqual({ id: 'turnip', days: 0, harvested: 0 });
    expect(plant(f, px, py, 'carrot')).toBeNull();
    expect(water(f, px, py)![`${px},${py}`]!.watered).toBe(true);
  });
  it('grows a watered crop one day per morning, then dries the soil', () => {
    let f = water(plant(till({}, farmZone, px, py)!, px, py, 'turnip')!, px, py)!;
    f = nextDay(f);
    expect(f[`${px},${py}`]).toEqual({ watered: false, crop: { id: 'turnip', days: 1, harvested: 0 } });
    expect(nextDay(f)[`${px},${py}`]!.crop!.days).toBe(1); // not watered: no growth
  });
  it('shows stages 0, 1, 2 and then ripe', () => {
    expect([0, 1, 2, 3, 4].map(days => cropStage({ id: 'turnip', days, harvested: 0 }))).toEqual([0, 1, 2, 3, 3]);
    expect(cropStage({ id: 'sunflower', days: 6, harvested: 0 })).toBe(2);
  });
  it('harvests only ripe crops, leaving tilled soil', () => {
    const planted = plant(till({}, farmZone, px, py)!, px, py, 'turnip')!;
    expect(harvest(planted, px, py)).toBeNull();
    const ripe = grown(planted, 3);
    const r = harvest(ripe, px, py)!;
    expect(r.item).toBe('turnip');
    expect(r.farm[`${px},${py}`]!.crop).toBeNull();
    expect(harvest(r.farm, px, py)).toBeNull();
  });
  it('lets strawberries fruit again every 3 days', () => {
    const ripe = grown(plant(till({}, farmZone, px, py)!, px, py, 'strawberry')!, 6);
    const r = harvest(ripe, px, py)!;
    expect(r.farm[`${px},${py}`]!.crop).toEqual({ id: 'strawberry', days: 0, harvested: 1 });
    expect(cropStage(r.farm[`${px},${py}`]!.crop!)).toBe(0);
    expect(harvest(grown(r.farm, 3), px, py)!.item).toBe('strawberry');
  });
  it('catches up watered crops while the world is empty, to ripe but no further', () => {
    const t = water(plant(till({}, farmZone, px, py)!, px, py, 'turnip')!, px, py)!;
    const week = catchUp(t, 7 * DAY_MS);
    expect(week[`${px},${py}`]).toEqual({ watered: true, crop: { id: 'turnip', days: 3, harvested: 0 } });
    expect(catchUp(t, DAY_MS - 1)).toEqual(t);
  });
  it('leaves unwatered crops waiting while the world is empty', () => {
    const t = plant(till({}, farmZone, px, py)!, px, py, 'turnip')!;
    expect(catchUp(t, 7 * DAY_MS)).toEqual(t);
  });
  it('gives a regrowing strawberry at most one harvest after a long time away', () => {
    const picked = harvest(grown(plant(till({}, farmZone, px, py)!, px, py, 'strawberry')!, 6), px, py)!.farm;
    const away = catchUp(water(picked, px, py)!, 30 * DAY_MS);
    expect(away[`${px},${py}`]!.crop).toEqual({ id: 'strawberry', days: 3, harvested: 1 });
  });
});
