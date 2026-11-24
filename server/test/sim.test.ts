import { beforeEach, describe, expect, it } from 'vitest';
import { FAINT_AT, TILE, ZONES, newWorldSave, type WorldSave } from '@ruminate/shared';
import { WorldState } from '../src/schema';
import { WorldSim } from '../src/sim';

const OWNER = '0'.repeat(32);
const KEY_A = 'a'.repeat(32);
const KEY_B = 'b'.repeat(32);
const at = (tx: number, ty: number) => ({ x: tx * TILE + 8, y: ty * TILE + 8 });
const spawn = at(ZONES.farm.spawn.x, ZONES.farm.spawn.y);
const doorStep = at(ZONES.farm.houseDoor!.x, ZONES.farm.houseDoor!.y + 1);

let now: number;
let save: WorldSave;
let state: InstanceType<typeof WorldState>;
let sim: WorldSim;

beforeEach(() => {
  now = 1_000_000;
  save = newWorldSave('MOON-4823', 'Test', OWNER);
  state = new WorldState();
  sim = new WorldSim(state, save, () => now);
});

const move = (sid: string, x: number, y: number, extra: Record<string, unknown> = {}) =>
  sim.move(sid, { x, y, zone: 'farm', facing: 'right', moving: true, ...extra });

describe('join', () => {
  it('spawns a new player at the farm spawn', () => {
    expect(sim.join('s1', KEY_A, 'Aris', 'ding')).toEqual({ ok: true });
    const p = state.players.get('s1')!;
    expect([p.zone, p.x, p.y, p.nickname, p.species]).toEqual(['farm', spawn.x, spawn.y, 'Aris', 'ding']);
  });

  it('puts a returning player back where they left', () => {
    save.players[KEY_A] = { nickname: 'Aris', species: 'gong', zone: 'market', x: 100, y: 170, facing: 'left' };
    sim.join('s1', KEY_A, 'Aris', 'gong');
    const p = state.players.get('s1')!;
    expect([p.zone, p.x, p.y, p.facing]).toEqual(['market', 100, 170, 'left']);
  });

  it('marks the owner', () => {
    sim.join('s0', OWNER, 'Boss', 'chime');
    sim.join('s1', KEY_A, 'Aris', 'ding');
    expect(state.players.get('s0')!.isOwner).toBe(true);
    expect(state.players.get('s1')!.isOwner).toBe(false);
  });

  it('join replaces an existing session with the same key', () => {
    sim.join('s1', KEY_A, 'Aris', 'ding');
    expect(sim.join('s2', KEY_A, 'Aris', 'ding')).toEqual({ ok: true, replaced: 's1' });
    expect([...state.players.keys()]).toEqual(['s2']);
    expect(sim.onlineCount()).toBe(1);
  });

  it('refuses a ninth different player but lets someone already in rejoin', () => {
    for (let i = 0; i < 8; i++) expect(sim.join(`s${i}`, i.toString(16).padStart(32, '0'), `P${i}`, 'ding').ok).toBe(true);
    expect(sim.join('s9', 'f'.repeat(32), 'Nine', 'ding')).toEqual({ ok: false, error: 'WORLD_FULL' });
    expect(sim.join('s10', '3'.padStart(32, '0'), 'P3', 'ding')).toEqual({ ok: true, replaced: 's3' });
    expect(sim.onlineCount()).toBe(8);
  });

  it('refuses banned keys, empty names and unknown characters', () => {
    save.banned.push(KEY_B);
    expect(sim.join('s1', KEY_B, 'Bo', 'ding')).toEqual({ ok: false, error: 'BANNED' });
    expect(sim.join('s2', KEY_A, '   ', 'ding')).toEqual({ ok: false, error: 'BAD_NAME' });
    expect(sim.join('s3', KEY_A, 'Aris', 'cat' as never)).toEqual({ ok: false, error: 'BAD_SPECIES' });
    expect(state.players.size).toBe(0);
  });
});

describe('move', () => {
  beforeEach(() => {
    sim.join('s1', KEY_A, 'Aris', 'ding');
  });

  it('accepts a legal step', () => {
    now += 66;
    expect(move('s1', spawn.x + 4, spawn.y)).toEqual({ ok: true });
    expect(state.players.get('s1')!.x).toBe(spawn.x + 4);
  });

  it.each([
    ['NaN', { x: NaN, y: 0 }],
    ['an empty object', {}],
    ['null', null],
    ['an unknown zone', { x: spawn.x + 1, y: spawn.y, zone: 'moon', facing: 'down', moving: true }],
    ['a bad facing', { x: spawn.x + 1, y: spawn.y, zone: 'farm', facing: 'sideways', moving: true }],
    ['a teleport', { x: spawn.x + 200, y: spawn.y, zone: 'farm', facing: 'down', moving: true }],
  ])('rejectMove: snaps back on %s', (_label, msg) => {
    now += 66;
    expect(sim.move('s1', msg)).toEqual({ ok: false, snapTo: { zone: 'farm', x: spawn.x, y: spawn.y } });
    expect(state.players.get('s1')!.x).toBe(spawn.x);
  });

  it('rejectMove: snaps back on walking into water', () => {
    save.players[KEY_B] = { nickname: 'Bo', species: 'ding', zone: 'farm', x: 11 * TILE + 8, y: 22 * TILE + 8, facing: 'left' };
    sim.join('s2', KEY_B, 'Bo', 'ding');
    // Two tiles west of (11,22) is pond water: close enough to walk, but solid.
    now += 1000;
    expect(sim.move('s2', { x: 9 * TILE + 8, y: 22 * TILE + 8, zone: 'farm', facing: 'left', moving: true }).ok).toBe(false);
  });

  it('changes zone through an exit and lands on its spawn', () => {
    const exit = ZONES.farm.exits[0]!;
    const inExit = at(exit.x, exit.y);
    state.players.get('s1')!.x = inExit.x - 4;
    state.players.get('s1')!.y = inExit.y;
    now += 66;
    expect(move('s1', inExit.x, inExit.y, { zone: 'market' })).toEqual({ ok: true });
    const p = state.players.get('s1')!;
    expect([p.zone, p.x, p.y]).toEqual(['market', exit.spawn.x * TILE + 8, exit.spawn.y * TILE + 8]);
  });

  it('refuses a zone change away from an exit', () => {
    now += 66;
    expect(move('s1', spawn.x + 2, spawn.y, { zone: 'market' }).ok).toBe(false);
  });

  it('clears an emote and bed when the player walks', () => {
    sim.emote('s1', 'sit');
    expect(state.players.get('s1')!.emote).toBe('sit');
    now += 66;
    move('s1', spawn.x + 3, spawn.y);
    expect(state.players.get('s1')!.emote).toBe('');
  });

  it('keeps the emote on a stop message that does not move', () => {
    sim.emote('s1', 'sit');
    now += 66;
    move('s1', spawn.x, spawn.y, { moving: false });
    expect(state.players.get('s1')!.emote).toBe('sit');
  });
});

describe('movement budget (anti-cheat)', () => {
  beforeEach(() => {
    sim.join('s1', KEY_A, 'Aris', 'ding');
  });

  it('refuses a teleport after standing still for a while', () => {
    now += 6000;
    expect(move('s1', spawn.x + 150, spawn.y).ok).toBe(false);
  });

  it('caps a flood of tiny moves near walking speed', () => {
    let x = spawn.x;
    const start = now;
    for (let i = 0; i < 100; i++) {
      now += 1;
      if (move('s1', x + 6, spawn.y).ok) x += 6;
    }
    const elapsed = now - start;
    // Walking for 100 ms covers 6.4 px; allow the burst budget and some slack, but nowhere near 600 px.
    expect(x - spawn.x).toBeLessThanOrEqual(25 + (64 * 1.25 * elapsed) / 1000);
  });

  it('accepts an honest client whose messages arrive bunched up by jitter', () => {
    let x = spawn.x;
    // A 15 fps client sends two frames' worth (8.3 px) about every 133 ms; Wi-Fi jitter bunches them up.
    for (const gap of [133, 20, 246, 100, 166, 60, 206, 133, 40, 226]) {
      now += gap;
      x += 8.3;
      expect(move('s1', x, spawn.y)).toEqual({ ok: true });
    }
  });

  it('refuses walking through the house', () => {
    const p = state.players.get('s1')!;
    p.x = 14 * TILE + 8;
    p.y = 5 * TILE + 8;
    now += 1000;
    expect(move('s1', 21 * TILE + 8, 5 * TILE + 8).ok).toBe(false);
  });
});

describe('emote', () => {
  it('ignores unknown emotes', () => {
    sim.join('s1', KEY_A, 'Aris', 'ding');
    sim.emote('s1', 'dance');
    expect(state.players.get('s1')!.emote).toBe('');
  });
});

describe('clock and sleep', () => {
  it('runs while someone is online', () => {
    sim.join('s1', KEY_A, 'Aris', 'ding');
    sim.tick(60_000);
    expect(state.minute).toBe(420);
  });

  it('pauses while nobody is online', () => {
    sim.tick(60_000);
    expect(state.minute).toBe(360);
  });

  it('only lets you go to bed near the house door', () => {
    sim.join('s1', KEY_A, 'Aris', 'ding');
    expect(sim.goToBed('s1')).toBe(false);
    const p = state.players.get('s1')!;
    p.x = doorStep.x;
    p.y = doorStep.y;
    expect(sim.goToBed('s1')).toBe(true);
    expect(p.inBed).toBe(true);
  });

  it('starts a new day once everyone online is in bed', () => {
    sim.join('s1', KEY_A, 'Aris', 'ding');
    sim.join('s2', KEY_B, 'Bo', 'chime');
    for (const sid of ['s1', 's2']) Object.assign(state.players.get(sid)!, doorStep);
    sim.goToBed('s1');
    expect(sim.tick(250)).toBeNull();
    sim.goToBed('s2');
    expect(sim.tick(250)).toBe('new-day');
    expect([state.day, state.minute]).toEqual([2, 360]);
    expect(state.players.get('s1')!.inBed).toBe(false);
  });

  it('makes everyone faint at 02:00 and wakes them at the door', () => {
    sim.join('s1', KEY_A, 'Aris', 'ding');
    state.minute = FAINT_AT - 1;
    state.players.get('s1')!.zone = 'market';
    expect(sim.tick(2000)).toBe('fainted');
    const p = state.players.get('s1')!;
    expect([state.day, state.minute]).toEqual([2, 360]);
    expect([p.zone, p.x, p.y]).toEqual(['farm', doorStep.x, doorStep.y]);
  });
});

describe('kick', () => {
  it('only lets the owner remove someone, and bans them', () => {
    sim.join('s0', OWNER, 'Boss', 'chime');
    sim.join('s1', KEY_A, 'Aris', 'ding');
    expect(sim.kick('s1', 's0')).toBeNull();
    expect(sim.kick('s0', 's1')).toBe(KEY_A);
    expect(save.banned).toContain(KEY_A);
  });

  it('does not let the owner remove themselves', () => {
    sim.join('s0', OWNER, 'Boss', 'chime');
    expect(sim.kick('s0', 's0')).toBeNull();
  });
});

describe('toSave', () => {
  it('records positions and the clock of the people who left', () => {
    sim.join('s1', KEY_A, 'Aris', 'ding');
    sim.tick(30_000);
    sim.leave('s1');
    const out = sim.toSave();
    expect(out.players[KEY_A]).toMatchObject({ nickname: 'Aris', zone: 'farm', x: spawn.x, y: spawn.y });
    expect(out.clock).toEqual({ day: 1, minute: 390 });
    expect(out.emptySince).toBe(now);
  });

  it('has no emptySince while someone is online', () => {
    sim.join('s1', KEY_A, 'Aris', 'ding');
    expect(sim.toSave().emptySince).toBeNull();
  });
});
