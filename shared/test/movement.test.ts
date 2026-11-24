import { describe, expect, it } from 'vitest';
import { TILE, type ZoneMap } from '../src/maps';
import { MAX_STEP_MS, WALK_SPEED, facingFor, moveIsPlausible, pathIsClear, stepPlayer } from '../src/movement';

// 12 × 8 test field: fence row at y=1, fence column at x=8, water at (3,6).
const field: ZoneMap = {
  id: 'farm',
  name: 'Test field',
  rows: [
    '............',
    '############',
    '........#...',
    '........#...',
    '........#...',
    '........#...',
    '...~....#...',
    '........#...',
  ],
  objects: [],
  exits: [],
  spawn: { x: 2, y: 4 },
};

const start = { x: 2 * TILE + 8, y: 4 * TILE + 8 };
const walk = (input: { dx: -1 | 0 | 1; dy: -1 | 0 | 1 }, ms: number, from = start) => {
  let p = from;
  for (let t = 0; t < ms; t += 100) p = stepPlayer(p, input, 100, field);
  return p;
};

describe('stepPlayer', () => {
  it('walks 64 px in a second on open grass', () => {
    const p = walk({ dx: 1, dy: 0 }, 1000);
    expect(p.x - start.x).toBeCloseTo(WALK_SPEED);
    expect(p.y).toBe(start.y);
  });

  it('normalises diagonals', () => {
    const p = walk({ dx: 1, dy: 1 }, 1000, { x: 24, y: 2 * TILE + 8 });
    expect(p.x - 24).toBeCloseTo(45.25, 1);
    expect(p.y - (2 * TILE + 8)).toBeCloseTo(45.25, 1);
  });

  it('clamps dt so a stalled tab cannot tunnel', () => {
    const p = stepPlayer(start, { dx: 1, dy: 0 }, 5000, field);
    expect(p.x - start.x).toBeLessThanOrEqual((WALK_SPEED * MAX_STEP_MS) / 1000 + 1e-9);
  });

  it('stops at a fence', () => {
    const p = walk({ dx: 1, dy: 0 }, 3000);
    expect(p.x).toBeLessThan(8 * TILE);
    expect(p.x).toBeGreaterThan(7 * TILE);
  });

  it('slides along a fence when walking diagonally into it', () => {
    const p = walk({ dx: 1, dy: -1 }, 3000, { x: 7 * TILE, y: 6 * TILE });
    expect(p.y).toBeLessThan(6 * TILE - 20);
    expect(p.x).toBeLessThan(8 * TILE);
  });

  it('does not move when standing still', () => {
    expect(stepPlayer(start, { dx: 0, dy: 0 }, 100, field)).toEqual(start);
  });
});

describe('facingFor', () => {
  it('keeps the previous facing when idle', () => expect(facingFor({ dx: 0, dy: 0 }, 'left')).toBe('left'));
  it('prefers horizontal on diagonals', () => expect(facingFor({ dx: 1, dy: 1 }, 'up')).toBe('right'));
  it('faces up', () => expect(facingFor({ dx: 0, dy: -1 }, 'down')).toBe('up'));
});

describe('moveIsPlausible', () => {
  it('accepts a normal step', () => {
    expect(moveIsPlausible(start, { x: start.x + 4, y: start.y }, 66, field)).toBe(true);
  });
  it('rejects a teleport', () => {
    expect(moveIsPlausible(start, { x: start.x + 200, y: start.y }, 66, field)).toBe(false);
  });
  it('rejects stepping into water', () => {
    expect(moveIsPlausible({ x: 3 * TILE + 8, y: 5 * TILE + 8 }, { x: 3 * TILE + 8, y: 6 * TILE + 8 }, 1000, field)).toBe(false);
  });
  it('rejects NaN', () => {
    expect(moveIsPlausible(start, { x: NaN, y: start.y }, 66, field)).toBe(false);
  });
});

describe('pathIsClear', () => {
  it('allows a straight walk across open grass', () => {
    expect(pathIsClear({ x: 24, y: 72 }, { x: 104, y: 72 }, field)).toBe(true);
  });
  it('refuses a path that crosses the fence column, even when both ends are open', () => {
    expect(pathIsClear({ x: 7 * TILE + 4, y: 4 * TILE + 8 }, { x: 9 * TILE + 8, y: 4 * TILE + 8 }, field)).toBe(false);
  });
  it('refuses an end point in the water', () => {
    expect(pathIsClear({ x: 3 * TILE + 8, y: 5 * TILE + 8 }, { x: 3 * TILE + 8, y: 6 * TILE + 8 }, field)).toBe(false);
  });
});
