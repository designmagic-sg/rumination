import { beforeEach, describe, expect, it } from 'vitest';
import { BAG_SIZE, GAME_DAY_MS, TILE, newWorldSave, type WorldSave } from '@ruminate/shared';
import { WorldState } from '../src/schema';
import { WorldSim } from '../src/sim';

const KEY = 'a'.repeat(32);
const KEY_B = 'b'.repeat(32);
const at = (tx: number, ty: number) => ({ x: tx * TILE + 8, y: ty * TILE + 8 });
// The first farm-plot tile is (12, 11); standing at (12, 10) puts it right in front.
const PLOT = { x: 12, y: 11 };

let now: number;
let save: WorldSave;
let state: InstanceType<typeof WorldState>;
let sim: WorldSim;

function standAt(sid: string, zone: 'farm' | 'market', tx: number, ty: number) {
  const p = state.players.get(sid)!;
  p.zone = zone;
  Object.assign(p, at(tx, ty));
}
const use = (slot: number, x = PLOT.x, y = PLOT.y, sid = 's1') => sim.farmAction(sid, { x, y, slot });
const bag = (sid = 's1') => sim.inventoryOf(sid)!.bag;
const rumis = (sid = 's1') => sim.inventoryOf(sid)!.rumis;

beforeEach(() => {
  now = 5_000_000;
  save = newWorldSave('MOON-4823', 'Test', KEY);
  state = new WorldState();
  sim = new WorldSim(state, save, () => now);
  sim.join('s1', KEY, 'Aris', 'ding');
  standAt('s1', 'farm', 12, 10);
});

describe('starting kit', () => {
  it('gives a new player a hoe, a can, 10 turnip seeds and 50 Rumis', () => {
    expect(bag().slice(0, 3)).toEqual([{ item: 'hoe', count: 1 }, { item: 'can', count: 1 }, { item: 'seed-turnip', count: 10 }]);
    expect(rumis()).toBe(50);
  });
  it('gives a player from a step-1 save the starting kit too', () => {
    save.players[KEY_B] = { nickname: 'Bo', species: 'chime', zone: 'farm', x: 200, y: 200, facing: 'down' };
    sim.join('s2', KEY_B, 'Bo', 'chime');
    expect(bag('s2')).toHaveLength(BAG_SIZE);
    expect(rumis('s2')).toBe(50);
  });
});

describe('farm actions', () => {
  it('tills, plants and waters the tile in front', () => {
    expect(use(0).ok).toBe(true);
    expect(state.soil.get('12,11')).toMatchObject({ watered: false, crop: '' });
    expect(use(2).ok).toBe(true);
    expect(bag()[2]).toEqual({ item: 'seed-turnip', count: 9 });
    expect(state.soil.get('12,11')).toMatchObject({ crop: 'turnip', stage: 0 });
    expect(use(1).ok).toBe(true);
    expect(state.soil.get('12,11')!.watered).toBe(true);
  });

  it('refuses tiles out of reach, off the plot, or in another zone', () => {
    expect(use(0, 14, 13).ok).toBe(false);
    expect(use(0, 12, 9).ok).toBe(false); // grass, not plot
    standAt('s1', 'market', 12, 10);
    expect(use(0).ok).toBe(false);
  });

  it('refuses hostile messages without changing anything', () => {
    for (const msg of [null, {}, { x: 12, y: 11 }, { x: 12, y: 11, slot: 99 }, { x: 12, y: 11, slot: 1.5 }, { x: 'a', y: 11, slot: 0 }]) {
      expect(sim.farmAction('s1', msg).ok).toBe(false);
    }
    expect(state.soil.size).toBe(0);
  });

  it('grows a watered crop overnight and shows its stage to everyone', () => {
    use(0); use(2); use(1);
    standAt('s1', 'farm', 17, 7);
    sim.goToBed('s1');
    expect(sim.tick(250)).toBe('new-day');
    expect(state.soil.get('12,11')).toMatchObject({ crop: 'turnip', stage: 1, watered: false });
  });

  it('farmAction harvests once', () => {
    use(0); use(2);
    for (let d = 0; d < 3; d++) {
      standAt('s1', 'farm', 12, 10);
      use(1);
      standAt('s1', 'farm', 17, 7);
      sim.goToBed('s1');
      sim.tick(250);
    }
    standAt('s1', 'farm', 12, 10);
    sim.join('s2', KEY_B, 'Bo', 'chime');
    standAt('s2', 'farm', 13, 10);
    expect(use(5, PLOT.x, PLOT.y, 's2')).toMatchObject({ ok: true });
    expect(use(5).ok).toBe(false);
    expect(bag('s2').filter(s => s?.item === 'turnip')).toEqual([{ item: 'turnip', count: 1 }]);
    expect(bag().some(s => s?.item === 'turnip')).toBe(false);
  });

  it('keeps a ripe crop in the ground when the bag is full', () => {
    save.farm = { '12,11': { watered: false, crop: { id: 'turnip', days: 3, harvested: 0 } } };
    save.players[KEY_B] = {
      nickname: 'Bo', species: 'chime', zone: 'farm', ...at(12, 10), facing: 'down',
      bag: Array.from({ length: BAG_SIZE }, () => ({ item: 'hoe', count: 1 })), rumis: 0,
    };
    const s2 = new WorldState();
    const sim2 = new WorldSim(s2, save, () => now);
    sim2.join('s2', KEY_B, 'Bo', 'chime');
    expect(sim2.farmAction('s2', { x: 12, y: 11, slot: 0 })).toEqual({ ok: false, toast: 'Your bag is full.' });
    expect(s2.soil.get('12,11')!.crop).toBe('turnip');
  });
});

describe('shop', () => {
  beforeEach(() => {
    standAt('s1', 'market', 22, 10);
    state.minute = 9 * 60;
  });

  it('sells seeds you can afford', () => {
    expect(sim.buy('s1', { item: 'seed-carrot', count: 1 }).ok).toBe(true);
    expect(rumis()).toBe(35);
    expect(sim.buy('s1', { item: 'seed-carrot', count: 10 })).toMatchObject({ ok: false });
    expect(rumis()).toBe(35);
  });

  it('refuses hostile or impossible purchases', () => {
    for (const msg of [{ item: 'seed-carrot', count: -1 }, { item: 'seed-carrot', count: 0 }, { item: 'seed-carrot', count: 1.5 },
      { item: 'seed-carrot', count: 1000 }, { item: 'hoe', count: 1 }, { item: 'turnip', count: 1 }, { item: 'gold', count: 1 }, null]) {
      expect(sim.buy('s1', msg).ok).toBe(false);
    }
    expect(rumis()).toBe(50);
  });

  it('is only open from 08:00 to 18:00, at the stall', () => {
    state.minute = 19 * 60;
    expect(sim.buy('s1', { item: 'seed-turnip', count: 1 })).toEqual({ ok: false, toast: 'The stall opens at 08:00.' });
    state.minute = 9 * 60;
    standAt('s1', 'market', 4, 10);
    expect(sim.buy('s1', { item: 'seed-turnip', count: 1 }).ok).toBe(false);
    standAt('s1', 'farm', 22, 10);
    expect(sim.buy('s1', { item: 'seed-turnip', count: 1 }).ok).toBe(false);
  });

  it('buys crops for Rumis, and only crops', () => {
    save.players[KEY_B] = {
      nickname: 'Bo', species: 'chime', zone: 'market', ...at(23, 10), facing: 'up',
      bag: [{ item: 'carrot', count: 5 }, { item: 'hoe', count: 1 }], rumis: 0,
    };
    sim.join('s2', KEY_B, 'Bo', 'chime');
    expect(sim.sell('s2', { slot: 0, count: 2 }).ok).toBe(true);
    expect(rumis('s2')).toBe(56);
    expect(bag('s2')[0]).toEqual({ item: 'carrot', count: 3 });
    expect(sim.sell('s2', { slot: 0, count: 4 }).ok).toBe(false);
    expect(sim.sell('s2', { slot: 1, count: 1 }).ok).toBe(false);
    expect(rumis('s2')).toBe(56);
  });
});

describe('bag', () => {
  it('swaps slots', () => {
    expect(sim.swap('s1', 0, 8)).toBe(true);
    expect(bag()[8]).toEqual({ item: 'hoe', count: 1 });
    expect(sim.swap('s1', 0, 30)).toBe(false);
  });
});

describe('saving and catching up', () => {
  it('saves the farm, bags and purses', () => {
    use(0);
    sim.leave('s1');
    const out = sim.toSave();
    expect(out.farm!['12,11']).toEqual({ watered: false, crop: null });
    expect(out.players[KEY]!.rumis).toBe(50);
    expect(out.players[KEY]!.bag![0]).toEqual({ item: 'hoe', count: 1 });
  });

  it('grows watered crops for the days the world was empty', () => {
    save.farm = { '12,11': { watered: true, crop: { id: 'turnip', days: 0, harvested: 0 } } };
    save.emptySince = now - 2 * GAME_DAY_MS;
    const s2 = new WorldState();
    new WorldSim(s2, save, () => now);
    expect(s2.soil.get('12,11')).toMatchObject({ crop: 'turnip', stage: 2, watered: true });
  });
});

describe('review fixes', () => {
  it('explains honest mistakes', () => {
    expect(use(2)).toEqual({ ok: false, toast: 'Till the soil first.' });
    expect(use(1)).toEqual({ ok: false, toast: 'Till the soil first.' });
    expect(use(0, 12, 9)).toEqual({ ok: false, toast: 'You can only dig on the farm plot.' });
    expect(use(0, 14, 13)).toEqual({ ok: false, toast: 'Too far away. Stand next to the tile.' });
    expect(use(7)).toEqual({ ok: false, toast: 'Pick a tool or seeds from your toolbar first.' });
    use(0);
    expect(use(0)).toEqual({ ok: false, toast: 'That soil is already tilled.' });
    use(2);
    expect(use(2)).toEqual({ ok: false, toast: 'Something is already growing here.' });
  });

  it('explains selling more than you have', () => {
    save.players[KEY_B] = { nickname: 'Bo', species: 'chime', zone: 'market', ...at(23, 10), facing: 'up', bag: [{ item: 'carrot', count: 2 }], rumis: 0 };
    sim.join('s2', KEY_B, 'Bo', 'chime');
    state.minute = 9 * 60;
    expect(sim.sell('s2', { slot: 0, count: 3 })).toEqual({ ok: false, toast: "You don't have that many." });
    expect(sim.sell('s2', { slot: 0, count: 1.5 }).ok).toBe(false);
    expect(sim.sell('s2', { slot: -1, count: 1 }).ok).toBe(false);
    expect(rumis('s2')).toBe(0);
  });

  it('takes no Rumis when the bag is full', () => {
    save.players[KEY_B] = {
      nickname: 'Bo', species: 'chime', zone: 'market', ...at(23, 10), facing: 'up',
      bag: Array.from({ length: BAG_SIZE }, () => ({ item: 'hoe', count: 1 })), rumis: 100,
    };
    sim.join('s2', KEY_B, 'Bo', 'chime');
    state.minute = 9 * 60;
    expect(sim.buy('s2', { item: 'seed-turnip', count: 1 })).toEqual({ ok: false, toast: 'Your bag is full.' });
    expect(rumis('s2')).toBe(100);
  });

  it('loads a step-1 save with an empty farm', () => {
    const old = newWorldSave('MOON-4823', 'Old', KEY);
    delete (old as { farm?: unknown }).farm;
    const s2 = new WorldState();
    new WorldSim(s2, old, () => now);
    expect(s2.soil.size).toBe(0);
  });

  it('does not grow crops twice when a world is loaded and saved again without anyone joining', () => {
    save.farm = { '12,11': { watered: true, crop: { id: 'sunflower', days: 0, harvested: 0 } } };
    save.emptySince = now - 2.5 * GAME_DAY_MS;
    const first = new WorldSim(new WorldState(), save, () => now).toSave();
    expect(first.farm!['12,11']!.crop!.days).toBe(2);
    const s3 = new WorldState();
    new WorldSim(s3, first, () => now);
    expect(s3.soil.get('12,11')).toMatchObject({ crop: 'sunflower', stage: 0 });
    const third = new WorldSim(new WorldState(), first, () => now + 0.6 * GAME_DAY_MS).toSave();
    expect(third.farm!['12,11']!.crop!.days).toBe(3); // the half day left over counts next time
  });
});
