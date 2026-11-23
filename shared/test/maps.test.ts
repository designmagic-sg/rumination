import { describe, expect, it } from 'vitest';
import { OBJECT_FOOTPRINT, TILE, ZONES, findExit, isSolid, type ZoneMap } from '../src/maps';

const zones = Object.values(ZONES);
const centre = (tx: number, ty: number) => [tx * TILE + TILE / 2, ty * TILE + TILE / 2] as const;
const tileSolid = (z: ZoneMap, tx: number, ty: number) => isSolid(z, ...centre(tx, ty));

function reachable(z: ZoneMap, from: { x: number; y: number }) {
  const h = z.rows.length, w = z.rows[0]!.length;
  const seen = new Set<string>([`${from.x},${from.y}`]);
  const q = [from];
  while (q.length) {
    const { x, y } = q.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen.has(k) || tileSolid(z, nx, ny)) continue;
      seen.add(k);
      q.push({ x: nx, y: ny });
    }
  }
  return seen;
}

describe.each(zones.map(z => [z.id, z] as const))('zone %s', (_id, z) => {
  it('has rows of equal length', () => {
    const w = z.rows[0]!.length;
    for (const row of z.rows) expect(row.length).toBe(w);
  });

  it('only uses known tile characters', () => {
    for (const row of z.rows) expect(row).toMatch(/^[.,=:~#b_]+$/);
  });

  it('has a spawn that is not solid', () => {
    expect(tileSolid(z, z.spawn.x, z.spawn.y)).toBe(false);
  });

  it('can reach every exit from its spawn', () => {
    const seen = reachable(z, z.spawn);
    for (const e of z.exits) {
      let ok = false;
      for (let y = e.y; y < e.y + e.h; y++) for (let x = e.x; x < e.x + e.w; x++) if (seen.has(`${x},${y}`)) ok = true;
      expect(ok, `exit to ${e.to}`).toBe(true);
    }
  });

  it('sends each exit to a spawn that is open in the target zone and not inside an exit', () => {
    for (const e of z.exits) {
      const target = ZONES[e.to];
      expect(tileSolid(target, e.spawn.x, e.spawn.y)).toBe(false);
      expect(findExit(target, ...centre(e.spawn.x, e.spawn.y))).toBeNull();
    }
  });
});

describe('farm', () => {
  const farm = ZONES.farm;
  const house = farm.objects.find(o => o.kind === 'house')!;
  const fp = OBJECT_FOOTPRINT.house;

  it('has an open tile just below the house door', () => {
    expect(farm.houseDoor).toBeDefined();
    expect(tileSolid(farm, farm.houseDoor!.x, farm.houseDoor!.y + 1)).toBe(false);
  });

  it('exits east to the market', () => {
    const east = farm.exits.find(e => e.x + e.w === farm.rows[0]!.length)!;
    expect(findExit(farm, ...centre(east.x, east.y))).toMatchObject({ to: 'market' });
  });

  it('treats outside the map as solid', () => {
    expect(isSolid(farm, -1, 5 * TILE)).toBe(true);
  });

  it('blocks the bottom rows of the house but not its roof', () => {
    expect(tileSolid(farm, house.x + 1, house.y + fp.h - 1)).toBe(true);
    expect(tileSolid(farm, house.x + 1, house.y)).toBe(false);
  });

  it('keeps the farm plot walkable', () => {
    const ty = farm.rows.findIndex(r => r.includes(':'));
    const tx = farm.rows[ty]!.indexOf(':');
    expect(tileSolid(farm, tx, ty)).toBe(false);
  });

  it('makes water solid', () => {
    const ty = farm.rows.findIndex(r => r.includes('~'));
    expect(tileSolid(farm, farm.rows[ty]!.indexOf('~'), ty)).toBe(true);
  });
});
