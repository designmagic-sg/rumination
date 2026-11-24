import {
  FACINGS,
  MAX_PLAYERS,
  TILE,
  ZONES,
  advanceClock,
  cleanNickname,
  findExit,
  isEmote,
  isSpecies,
  isZoneId,
  MOVE_ALLOWANCE,
  MOVE_BURST,
  pathIsClear,
  startNextDay,
  type Facing,
  type Species,
  type WorldSave,
  type ZoneId,
} from '@ruminate/shared';
import { PlayerState, type WorldState } from './schema';

export type JoinResult =
  | { ok: true; replaced?: string }
  | { ok: false; error: 'BANNED' | 'BAD_NAME' | 'BAD_SPECIES' | 'WORLD_FULL' };
export type MoveResult = { ok: true } | { ok: false; snapTo: { zone: ZoneId; x: number; y: number } };
export type TickEvent = 'new-day' | 'fainted';

/** How close to the house door you must stand to go to bed, in pixels. */
const BED_REACH = 1.5 * TILE;
const tileCentre = (t: { x: number; y: number }) => ({ x: t.x * TILE + 8, y: t.y * TILE + 8 });

interface Session {
  key: string;
  lastMoveAt: number;
  /** Pixels this player may still walk: refills at MOVE_ALLOWANCE per second, up to MOVE_BURST. */
  budget: number;
}

/**
 * The rules of a running world, with no networking. It changes the synced `state`
 * and keeps the save up to date for the people who leave.
 */
export class WorldSim {
  private sessions = new Map<string, Session>();

  constructor(
    private state: WorldState,
    private save: WorldSave,
    private now: () => number = Date.now,
  ) {
    state.name = save.name;
    state.code = save.code;
    state.day = save.clock.day;
    state.minute = save.clock.minute;
  }

  onlineCount(): number {
    return this.sessions.size;
  }

  isOwner(sessionId: string): boolean {
    return this.sessions.get(sessionId)?.key === this.save.ownerKey;
  }

  join(sessionId: string, playerKey: string, nickname: string, species: Species): JoinResult {
    if (this.save.banned.includes(playerKey)) return { ok: false, error: 'BANNED' };
    const name = cleanNickname(String(nickname ?? ''));
    if (!name) return { ok: false, error: 'BAD_NAME' };
    if (!isSpecies(species)) return { ok: false, error: 'BAD_SPECIES' };
    const alreadyIn = [...this.sessions.values()].some(s => s.key === playerKey);
    if (!alreadyIn && this.sessions.size >= MAX_PLAYERS) return { ok: false, error: 'WORLD_FULL' };

    let replaced: string | undefined;
    for (const [sid, s] of this.sessions) {
      if (s.key === playerKey) {
        this.leave(sid);
        replaced = sid;
      }
    }

    const saved = this.save.players[playerKey];
    const start = saved && isZoneId(saved.zone) ? saved : { zone: 'farm' as const, ...tileCentre(ZONES.farm.spawn), facing: 'down' as Facing };
    const p = new PlayerState();
    p.nickname = name;
    p.species = species;
    p.zone = start.zone;
    p.x = start.x;
    p.y = start.y;
    p.facing = start.facing;
    p.isOwner = playerKey === this.save.ownerKey;
    this.state.players.set(sessionId, p);
    this.sessions.set(sessionId, { key: playerKey, lastMoveAt: this.now(), budget: MOVE_BURST });
    this.save.emptySince = null;
    return replaced ? { ok: true, replaced } : { ok: true };
  }

  leave(sessionId: string): void {
    const s = this.sessions.get(sessionId);
    const p = this.state.players.get(sessionId);
    if (s && p) {
      this.save.players[s.key] = {
        nickname: p.nickname,
        species: p.species as Species,
        zone: p.zone as ZoneId,
        x: p.x,
        y: p.y,
        facing: p.facing as Facing,
      };
    }
    this.sessions.delete(sessionId);
    this.state.players.delete(sessionId);
    if (this.sessions.size === 0) this.save.emptySince = this.now();
  }

  move(sessionId: string, msg: unknown): MoveResult {
    const s = this.sessions.get(sessionId);
    const p = this.state.players.get(sessionId);
    if (!s || !p) return { ok: false, snapTo: { zone: 'farm', ...tileCentre(ZONES.farm.spawn) } };
    const snap: MoveResult = { ok: false, snapTo: { zone: p.zone as ZoneId, x: p.x, y: p.y } };

    if (typeof msg !== 'object' || msg === null) return snap;
    const m = msg as Record<string, unknown>;
    const { x, y, zone, facing, moving } = m;
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return snap;
    if (!isZoneId(zone) || typeof facing !== 'string' || !(FACINGS as readonly string[]).includes(facing)) return snap;

    const now = this.now();
    const here = ZONES[p.zone as ZoneId];
    // Distance budget: refill for the time since the last accepted move, capped at a short burst.
    // A flood of tiny moves, or a long idle followed by a teleport, both run out of budget.
    const budget = Math.min(MOVE_BURST, s.budget + (MOVE_ALLOWANCE * Math.max(0, now - s.lastMoveAt)) / 1000);
    const cost = Math.hypot(x - p.x, y - p.y);
    if (cost > budget + 0.5) return snap;
    if (!pathIsClear({ x: p.x, y: p.y }, { x, y }, here)) return snap;

    let dest = { zone: p.zone as ZoneId, x, y };
    if (zone !== p.zone) {
      const exit = findExit(here, x, y);
      if (!exit || exit.to !== zone) return snap;
      dest = { zone: exit.to, ...tileCentre(exit.spawn) };
    }

    const moved = dest.x !== p.x || dest.y !== p.y || dest.zone !== p.zone;
    p.zone = dest.zone;
    p.x = dest.x;
    p.y = dest.y;
    p.facing = facing;
    p.moving = moving === true;
    if (moved) {
      p.emote = '';
      p.inBed = false;
    }
    s.budget = Math.max(0, budget - cost);
    s.lastMoveAt = now;
    return { ok: true };
  }

  emote(sessionId: string, kind: unknown): void {
    const p = this.state.players.get(sessionId);
    if (p && isEmote(kind)) p.emote = kind;
  }

  goToBed(sessionId: string): boolean {
    const p = this.state.players.get(sessionId);
    const door = ZONES.farm.houseDoor;
    if (!p || !door || p.zone !== 'farm') return false;
    const c = tileCentre(door);
    if (Math.hypot(p.x - c.x, p.y - c.y) > BED_REACH) return false;
    p.inBed = true;
    p.emote = '';
    return true;
  }

  /** Owner only. Bans the target's key and returns it, so the room can disconnect them. */
  kick(bySessionId: string, targetSessionId: string): string | null {
    if (!this.isOwner(bySessionId) || bySessionId === targetSessionId) return null;
    const target = this.sessions.get(targetSessionId);
    if (!target) return null;
    if (!this.save.banned.includes(target.key)) this.save.banned.push(target.key);
    return target.key;
  }

  tick(elapsedMs: number): TickEvent | null {
    if (this.sessions.size === 0) return null;
    const { clock, fainted } = advanceClock({ day: this.state.day, minute: this.state.minute }, elapsedMs);
    this.state.minute = clock.minute;
    if (fainted) {
      const door = ZONES.farm.houseDoor!;
      const step = tileCentre({ x: door.x, y: door.y + 1 });
      this.state.players.forEach(p => {
        p.zone = 'farm';
        p.x = step.x;
        p.y = step.y;
        p.facing = 'down';
        p.moving = false;
      });
      this.newDay();
      return 'fainted';
    }
    let allInBed = true;
    this.state.players.forEach(p => {
      if (!p.inBed) allInBed = false;
    });
    if (allInBed) {
      this.newDay();
      return 'new-day';
    }
    return null;
  }

  private newDay(): void {
    const next = startNextDay({ day: this.state.day, minute: this.state.minute });
    this.state.day = next.day;
    this.state.minute = next.minute;
    this.state.players.forEach(p => {
      p.inBed = false;
      p.emote = '';
    });
  }

  toSave(): WorldSave {
    for (const [sid, s] of this.sessions) {
      const p = this.state.players.get(sid);
      if (p) {
        this.save.players[s.key] = {
          nickname: p.nickname,
          species: p.species as Species,
          zone: p.zone as ZoneId,
          x: p.x,
          y: p.y,
          facing: p.facing as Facing,
        };
      }
    }
    this.save.clock = { day: this.state.day, minute: this.state.minute };
    this.save.emptySince = this.sessions.size === 0 ? (this.save.emptySince ?? this.now()) : null;
    return structuredClone(this.save);
  }
}
