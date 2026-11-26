import {
  CROPS,
  FACINGS,
  GAME_DAY_MS,
  ITEMS,
  STARTING_RUMIS,
  OBJECT_FOOTPRINT,
  addItem,
  catchUp,
  cleanBag,
  cropOfSeed,
  cropStage,
  harvest,
  isItemId,
  newBag,
  nextDay,
  plant,
  removeItem,
  shopIsOpen,
  swapSlots,
  till,
  water,
  type Farm,
  type Slot,
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
import { PlayerState, SoilState, type WorldState } from './schema';

export type JoinResult =
  | { ok: true; replaced?: string }
  | { ok: false; error: 'BANNED' | 'BAD_NAME' | 'BAD_SPECIES' | 'WORLD_FULL' };
export type MoveResult = { ok: true } | { ok: false; snapTo: { zone: ZoneId; x: number; y: number } };
export type TickEvent = 'new-day' | 'fainted';
export type ActionResult = { ok: true; toast?: string } | { ok: false; toast?: string };

/** How far from the stall (in tiles) you can trade. */
const SHOP_REACH = 3;
const MAX_TRADE = 99;

/** How close to the house door you must stand to go to bed, in pixels. */
const BED_REACH = 1.5 * TILE;
const tileCentre = (t: { x: number; y: number }) => ({ x: t.x * TILE + 8, y: t.y * TILE + 8 });

interface Session {
  key: string;
  lastMoveAt: number;
  /** Pixels this player may still walk: refills at MOVE_ALLOWANCE per second, up to MOVE_BURST. */
  budget: number;
  /** Private to this player: sent to them alone, never synced. */
  bag: Slot[];
  rumis: number;
}

/**
 * The rules of a running world, with no networking. It changes the synced `state`
 * and keeps the save up to date for the people who leave.
 */
export class WorldSim {
  private sessions = new Map<string, Session>();
  private farm: Farm;

  constructor(
    private state: WorldState,
    private save: WorldSave,
    private now: () => number = Date.now,
  ) {
    state.name = save.name;
    state.code = save.code;
    state.day = save.clock.day;
    state.minute = save.clock.minute;
    let farm = save.farm ?? {};
    // Catch up on growth while the world was empty, keeping any part-day for next time.
    if (save.emptySince != null) {
      const elapsed = now() - save.emptySince;
      const days = Math.floor(Math.max(0, elapsed) / GAME_DAY_MS);
      if (days > 0) {
        farm = catchUp(farm, elapsed);
        save.emptySince += days * GAME_DAY_MS;
      }
    }
    this.farm = farm;
    for (const k of Object.keys(farm)) this.syncSoil(k);
  }

  private syncSoil(k: string) {
    const plot = this.farm[k];
    if (!plot) {
      this.state.soil.delete(k);
      return;
    }
    let s = this.state.soil.get(k);
    if (!s) {
      s = new SoilState();
      this.state.soil.set(k, s);
    }
    s.watered = plot.watered;
    s.crop = plot.crop?.id ?? '';
    s.stage = plot.crop ? cropStage(plot.crop) : 0;
  }

  private setFarm(next: Farm) {
    const keys = new Set([...Object.keys(this.farm), ...Object.keys(next)]);
    this.farm = next;
    for (const k of keys) this.syncSoil(k);
  }

  inventoryOf(sessionId: string): { bag: Slot[]; rumis: number } | null {
    const s = this.sessions.get(sessionId);
    return s ? { bag: s.bag.map(x => (x ? { ...x } : null)), rumis: s.rumis } : null;
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
    const rumis = saved?.rumis;
    this.sessions.set(sessionId, {
      key: playerKey,
      lastMoveAt: this.now(),
      budget: MOVE_BURST,
      bag: cleanBag(saved?.bag) ?? newBag(),
      rumis: Number.isInteger(rumis) && rumis! >= 0 ? rumis! : STARTING_RUMIS,
    });
    this.save.emptySince = null;
    return replaced ? { ok: true, replaced } : { ok: true };
  }

  leave(sessionId: string): void {
    this.writePlayer(sessionId);
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
    this.setFarm(nextDay(this.farm));
    this.state.players.forEach(p => {
      p.inBed = false;
      p.emote = '';
    });
  }

  private writePlayer(sessionId: string) {
    const s = this.sessions.get(sessionId);
    const p = this.state.players.get(sessionId);
    if (!s || !p) return;
    this.save.players[s.key] = {
      nickname: p.nickname,
      species: p.species as Species,
      zone: p.zone as ZoneId,
      x: p.x,
      y: p.y,
      facing: p.facing as Facing,
      bag: s.bag,
      rumis: s.rumis,
    };
  }

  /** Use the item in `slot` on tile (x, y): harvest a ripe crop, or till, water or plant. */
  farmAction(sessionId: string, msg: unknown): ActionResult {
    const s = this.sessions.get(sessionId);
    const p = this.state.players.get(sessionId);
    if (!s || !p || typeof msg !== 'object' || msg === null) return { ok: false };
    const { x, y, slot } = msg as Record<string, unknown>;
    if (![x, y, slot].every(Number.isInteger)) return { ok: false };
    const tx = x as number, ty = y as number, i = slot as number;
    if (i < 0 || i >= s.bag.length || p.zone !== 'farm') return { ok: false };
    // Within reach: the target tile touches the tile under the player's feet.
    if (Math.abs(tx - Math.floor(p.x / TILE)) > 1 || Math.abs(ty - Math.floor(p.y / TILE)) > 1) {
      return { ok: false, toast: 'Too far away. Stand next to the tile.' };
    }

    const ripe = harvest(this.farm, tx, ty);
    if (ripe) {
      const bag = addItem(s.bag, ripe.item, 1);
      if (!bag) return { ok: false, toast: 'Your bag is full.' };
      s.bag = bag;
      this.setFarm(ripe.farm);
      return { ok: true, toast: `+1 ${ITEMS[ripe.item].name}` };
    }

    const held = s.bag[i];
    if (!held) return { ok: false, toast: 'Pick a tool or seeds from your toolbar first.' };
    const plot = this.farm[`${tx},${ty}`];
    if (held.item === 'hoe') {
      if (plot) return { ok: false, toast: 'That soil is already tilled.' };
      const f = till(this.farm, ZONES.farm, tx, ty);
      if (!f) return { ok: false, toast: 'You can only dig on the farm plot.' };
      this.setFarm(f);
      return { ok: true };
    }
    if (held.item === 'can') {
      const f = water(this.farm, tx, ty);
      if (!f) return { ok: false, toast: 'Till the soil first.' };
      this.setFarm(f);
      return { ok: true };
    }
    const crop = cropOfSeed(held.item);
    if (crop) {
      if (!plot) return { ok: false, toast: 'Till the soil first.' };
      if (plot.crop) return { ok: false, toast: 'Something is already growing here.' };
      const f = plant(this.farm, tx, ty, crop);
      const bag = f && removeItem(s.bag, i, 1);
      if (!f || !bag) return { ok: false };
      s.bag = bag;
      this.setFarm(f);
      return { ok: true };
    }
    return { ok: false, toast: 'Use a hoe, the watering can or seeds here.' };
  }

  /** Is this player at the open market stall? Returns a reason when not. */
  private atShop(sessionId: string): string | null {
    const p = this.state.players.get(sessionId);
    if (!p || p.zone !== 'market') return 'You need to be at the market stall.';
    const stall = ZONES.market.objects.find(o => o.kind === 'stall')!;
    const fp = OBJECT_FOOTPRINT.stall;
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    const dx = Math.max(stall.x - tx, 0, tx - (stall.x + fp.w - 1));
    const dy = Math.max(stall.y - ty, 0, ty - (stall.y + fp.h - 1));
    if (Math.max(dx, dy) > SHOP_REACH) return 'You need to be at the market stall.';
    if (!shopIsOpen(this.state.minute)) return 'The stall opens at 08:00.';
    return null;
  }

  buy(sessionId: string, msg: unknown): ActionResult {
    const s = this.sessions.get(sessionId);
    if (!s || typeof msg !== 'object' || msg === null) return { ok: false };
    const { item, count } = msg as Record<string, unknown>;
    if (!isItemId(item) || !Number.isInteger(count) || (count as number) < 1 || (count as number) > MAX_TRADE) return { ok: false };
    const crop = cropOfSeed(item);
    if (!crop) return { ok: false };
    const closed = this.atShop(sessionId);
    if (closed) return { ok: false, toast: closed };
    const cost = CROPS[crop].seedPrice * (count as number);
    if (cost > s.rumis) return { ok: false, toast: 'Not enough Rumis.' };
    const bag = addItem(s.bag, item, count as number);
    if (!bag) return { ok: false, toast: 'Your bag is full.' };
    s.bag = bag;
    s.rumis -= cost;
    return { ok: true };
  }

  sell(sessionId: string, msg: unknown): ActionResult {
    const s = this.sessions.get(sessionId);
    if (!s || typeof msg !== 'object' || msg === null) return { ok: false };
    const { slot, count } = msg as Record<string, unknown>;
    if (!Number.isInteger(slot) || !Number.isInteger(count) || (count as number) < 1 || (count as number) > MAX_TRADE) return { ok: false };
    const held = s.bag[slot as number];
    if (!held || ITEMS[held.item].kind !== 'crop') return { ok: false };
    const closed = this.atShop(sessionId);
    if (closed) return { ok: false, toast: closed };
    if ((count as number) > held.count) return { ok: false, toast: "You don't have that many." };
    const bag = removeItem(s.bag, slot as number, count as number);
    if (!bag) return { ok: false };
    s.bag = bag;
    s.rumis += CROPS[held.item as keyof typeof CROPS].sellPrice * (count as number);
    return { ok: true };
  }

  swap(sessionId: string, a: unknown, b: unknown): boolean {
    const s = this.sessions.get(sessionId);
    if (!s || !Number.isInteger(a) || !Number.isInteger(b)) return false;
    const bag = swapSlots(s.bag, a as number, b as number);
    if (!bag) return false;
    s.bag = bag;
    return true;
  }

  toSave(): WorldSave {
    for (const sid of this.sessions.keys()) this.writePlayer(sid);
    this.save.farm = this.farm;
    this.save.clock = { day: this.state.day, minute: this.state.minute };
    this.save.emptySince = this.sessions.size === 0 ? (this.save.emptySince ?? this.now()) : null;
    return structuredClone(this.save);
  }
}
