import { isSolid, type ZoneMap } from './maps';

export interface Input {
  dx: -1 | 0 | 1;
  dy: -1 | 0 | 1;
}
export type Facing = 'down' | 'up' | 'left' | 'right';
/** A player's feet, in world pixels. */
export interface Pos {
  x: number;
  y: number;
}

export const WALK_SPEED = 64;
export const MAX_STEP_MS = 100;
export const HITBOX = { w: 10, h: 6 };

export const FACINGS: readonly Facing[] = ['down', 'up', 'left', 'right'];

/** Does the hitbox centred on these feet touch anything solid? */
export function blocked(zone: ZoneMap, x: number, y: number): boolean {
  const hw = HITBOX.w / 2, hh = HITBOX.h / 2, e = 0.001;
  return (
    isSolid(zone, x - hw, y - hh) ||
    isSolid(zone, x + hw - e, y - hh) ||
    isSolid(zone, x - hw, y + hh - e) ||
    isSolid(zone, x + hw - e, y + hh - e)
  );
}

/** Move along one axis as far as possible, up to `delta`. */
function slide(zone: ZoneMap, x: number, y: number, delta: number, axis: 'x' | 'y'): number {
  const at = (d: number) => (axis === 'x' ? blocked(zone, x + d, y) : blocked(zone, x, y + d));
  if (!at(delta)) return delta;
  let lo = 0, hi = delta;
  for (let i = 0; i < 8; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid)) hi = mid;
    else lo = mid;
  }
  return lo;
}

export function stepPlayer(pos: Pos, input: Input, dtMs: number, zone: ZoneMap): Pos {
  if (!input.dx && !input.dy) return pos;
  const dt = Math.min(Math.max(dtMs, 0), MAX_STEP_MS) / 1000;
  const len = Math.hypot(input.dx, input.dy);
  const vx = (input.dx / len) * WALK_SPEED * dt;
  const vy = (input.dy / len) * WALK_SPEED * dt;
  const x = pos.x + (vx ? slide(zone, pos.x, pos.y, vx, 'x') : 0);
  const y = pos.y + (vy ? slide(zone, x, pos.y, vy, 'y') : 0);
  return { x, y };
}

export function facingFor(input: Input, previous: Facing): Facing {
  if (input.dx) return input.dx > 0 ? 'right' : 'left';
  if (input.dy) return input.dy > 0 ? 'down' : 'up';
  return previous;
}

/** Server checks for movement. An honest client walks at WALK_SPEED; allow 25% slack for timing. */
export const MOVE_ALLOWANCE = WALK_SPEED * 1.25;
/** The most distance a player can bank by standing still: a quarter-second burst. */
export const MOVE_BURST = MOVE_ALLOWANCE * 0.25;

/** Is every point along the straight line from `from` to `to` walkable? Sampled every 4 px or less. */
export function pathIsClear(from: Pos, to: Pos, zone: ZoneMap): boolean {
  if (![to.x, to.y, from.x, from.y].every(Number.isFinite)) return false;
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(dist / 4));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (blocked(zone, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t)) return false;
  }
  return true;
}

/** Could an honest client have walked from `from` to `to` in this time, without passing through walls? */
export function moveIsPlausible(from: Pos, to: Pos, elapsedMs: number, zone: ZoneMap): boolean {
  if (![to.x, to.y, from.x, from.y, elapsedMs].every(Number.isFinite)) return false;
  const limit = (WALK_SPEED * Math.max(elapsedMs, 50)) / 1000 * 1.5 + 2;
  if (Math.hypot(to.x - from.x, to.y - from.y) > limit) return false;
  return pathIsClear(from, to, zone);
}
