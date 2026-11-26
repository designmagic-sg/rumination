import Phaser from 'phaser';
import type { Room } from '@colyseus/sdk';
import {
  OBJECT_FOOTPRINT,
  SPECIES,
  TILE,
  ZONES,
  facingFor,
  findExit,
  formatClock,
  stepPlayer,
  type Facing,
  type Slot,
  type Input,
  type Pos,
  type Species,
  type ZoneId,
  type ZoneMap,
} from '@ruminate/shared';
import type { Hud } from '../hud/hud';
import { mountClock } from '../hud/clock';
import { mountInventory, type Inventory } from '../hud/inventory';
import { mountShop, type Shop } from '../hud/shop';
import { mountFarmView, preloadFarm } from './farmView';
import { mountNight } from './night';
import { PlayerView, type PlayerLook } from './players';
import { TILE_FRAMES, frameFor } from './tiles';

export interface WorldSceneData {
  room: Room;
  species: Species;
  hud: Hud;
}

const POSES = [
  'front', 'threeq', 'side', 'back', 'walk', 'jump', 'sit', 'sleep',
  ...['down', 'side', 'up'].flatMap(dir => [0, 1, 2, 3].map(i => `walk-${dir}-${i}`)),
];
const PROPS = ['house', 'house-lit', 'shed', 'stall', 'board', 'sign', 'lamp', 'lamp-lit', 'tree', 'rock'];
const ZOOM = 3;
const SEND_EVERY_MS = 66;
const INTERP_DELAY_MS = 100;
const BED_REACH = 1.5 * TILE;
/** Tiles from the stall's footprint where the shop opens (the server checks the same). */
const SHOP_REACH = 3;
const FACING_STEP: Record<Facing, [number, number]> = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };

/** The synced player fields this scene reads. */
interface PlayerStateLike extends PlayerLook {
  zone: string;
  x: number;
  y: number;
  isOwner: boolean;
}

interface Remote {
  view: PlayerView;
  samples: { t: number; x: number; y: number }[];
}

const centre = (t: { x: number; y: number }): Pos => ({ x: t.x * TILE + 8, y: t.y * TILE + 8 });

export class WorldScene extends Phaser.Scene {
  private room!: Room;
  private hud!: Hud;
  private zone!: ZoneMap;
  private zoneObjects: Phaser.GameObjects.GameObject[] = [];
  private waterTiles: Phaser.Tilemaps.Tile[] = [];
  private layer?: Phaser.Tilemaps.TilemapLayer;
  private me: Pos = { x: 0, y: 0 };
  private facing: Facing = 'down';
  private moving = false;
  private myView?: PlayerView;
  private remotes = new Map<string, Remote>();
  private ready = false;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private sinceSend = 0;
  private lastSent = '';
  private lastSendAt = 0;
  private zoneChangeAt = -Infinity;
  private waterClock = 0;
  private sinceList = 0;
  private wasInBed = false;
  /** Set by the browser's keydown for E or Space, used once by the next frame. */
  private actionPressed = false;
  private nameShown = false;
  /** The current zone's props, so night.ts can light windows and lamps. */
  readonly props: Phaser.GameObjects.Image[] = [];
  private night!: ReturnType<typeof mountNight>;
  private clockView!: ReturnType<typeof mountClock>;
  private farmView!: ReturnType<typeof mountFarmView>;
  private inventory!: Inventory;
  private shop!: Shop;

  constructor() {
    super('world');
  }

  init(data: WorldSceneData) {
    this.room = data.room;
    this.hud = data.hud;
  }

  preload() {
    this.load.spritesheet('tiles', '/tiles/tiles.png', { frameWidth: 16, frameHeight: 16 });
    this.load.image('tiles-img', '/tiles/tiles.png');
    for (const p of PROPS) this.load.image(p, `/tiles/${p}.png`);
    for (const sp of SPECIES) for (const pose of POSES) this.load.image(`${sp}-${pose}`, `/sprites/${sp}-${pose}.png`);
    preloadFarm(this);
  }

  create() {
    this.cameras.main.setZoom(ZOOM).setRoundPixels(true).setBackgroundColor('#76A062');
    this.night = mountNight(this, this.props);
    this.clockView = mountClock(this.hud.clockSlot);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.clockView.destroy());
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,E,Z,X,C,P,SPACE') as Record<string, Phaser.Input.Keyboard.Key>;
    this.farmView = mountFarmView(this);
    this.inventory = mountInventory(this.hud.root, (a, b) => this.room.send('swap', { a, b }));
    this.shop = mountShop(this.hud.root, {
      buy: (item, count) => this.room.send('buy', { item, count }),
      sell: (slot, count) => this.room.send('sell', { slot, count }),
    });
    this.room.onMessage('inventory', (inv: { bag: Slot[]; rumis: number }) => {
      this.inventory.set(inv.bag, inv.rumis);
      this.shop.set(inv.bag, inv.rumis);
    });
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => this.inventory.select(this.inventory.selected + Math.sign(dy)));
    this.input.on('pointerdown', () => this.useTarget());
    // Slot keys and Tab come straight from the browser: a quick tap can fall between two game frames.
    const onKey = (e: KeyboardEvent) => {
      if (/^Digit[1-9]$/.test(e.code)) this.inventory.select(Number(e.code.slice(5)) - 1);
      else if ((e.code === 'KeyE' || e.code === 'Space') && !e.repeat) this.actionPressed = true;
      else if (e.code === 'Tab') {
        e.preventDefault();
        this.inventory.toggleBag();
      }
    };
    window.addEventListener('keydown', onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => window.removeEventListener('keydown', onKey));
    this.events.once(Phaser.Scenes.Events.DESTROY, () => window.removeEventListener('keydown', onKey));

    this.room.onMessage('snap', (s: { zone: ZoneId; x: number; y: number }) => {
      if (s.zone !== this.zone?.id) this.buildZone(s.zone);
      this.me = { x: s.x, y: s.y };
      this.lastSent = '';
    });
    this.room.onMessage('event', (e: { kind: string; day: number }) => {
      if (e.kind === 'new-day') this.hud.toasts.show(`Good morning! Day ${e.day}`);
      if (e.kind === 'fainted') this.hud.toasts.show(`You fainted from tiredness… Day ${e.day}`);
      this.night.morning();
    });
    this.room.onMessage('toast', (t: string) => this.hud.toasts.show(String(t)));
    // Now that every handler is in place, ask for this player's bag.
    this.room.send('ready');

    if (import.meta.env.DEV) {
      (window as unknown as { __ruminate: unknown }).__ruminate = {
        players: () => (this.myView ? 1 : 0) + this.remotes.size,
        me: () => ({ ...this.me, zone: this.zone?.id }),
      };
    }
  }

  /** The tile in front of the player's feet. */
  private targetTile() {
    const [dx, dy] = FACING_STEP[this.facing];
    return { x: Math.floor(this.me.x / TILE) + dx, y: Math.floor(this.me.y / TILE) + dy };
  }

  private useTarget() {
    if (!this.ready || this.zone.id !== 'farm') return;
    const t = this.targetTile();
    this.room.send('use', { x: t.x, y: t.y, slot: this.inventory.selected });
  }

  private nearStall(): boolean {
    if (this.zone.id !== 'market') return false;
    const stall = this.zone.objects.find(o => o.kind === 'stall');
    if (!stall) return false;
    const fp = OBJECT_FOOTPRINT.stall;
    const tx = Math.floor(this.me.x / TILE), ty = Math.floor(this.me.y / TILE);
    const dx = Math.max(stall.x - tx, 0, tx - (stall.x + fp.w - 1));
    const dy = Math.max(stall.y - ty, 0, ty - (stall.y + fp.h - 1));
    return Math.max(dx, dy) <= SHOP_REACH;
  }

  private myState(): PlayerStateLike | undefined {
    return this.room.state?.players?.get(this.room.sessionId) as PlayerStateLike | undefined;
  }

  private buildZone(id: ZoneId) {
    for (const o of this.zoneObjects) o.destroy();
    this.zoneObjects = [];
    this.props.length = 0;
    for (const r of this.remotes.values()) r.view.destroy();
    this.remotes.clear();
    this.layer?.tilemap.destroy();

    const zone = ZONES[id];
    this.zone = zone;
    const data = zone.rows.map((row, ty) => [...row].map((ch, tx) => frameFor(ch, tx, ty)));
    const map = this.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
    const tileset = map.addTilesetImage('tiles-img', 'tiles-img', TILE, TILE, 0, 0)!;
    const layer = map.createLayer(0, tileset, 0, 0) as Phaser.Tilemaps.TilemapLayer;
    layer.setDepth(-10);
    this.layer = layer;
    this.waterTiles = layer.filterTiles((t: Phaser.Tilemaps.Tile) => t.index === TILE_FRAMES.water1);

    for (const o of zone.objects) {
      const fp = OBJECT_FOOTPRINT[o.kind];
      const img = this.add.image(o.x * TILE, o.y * TILE, o.kind).setOrigin(0, 0);
      // Props are drawn to their footprint; the house is a little taller than its tiles.
      img.setY((o.y + fp.h) * TILE - img.height);
      img.setX(o.x * TILE + Math.round((fp.w * TILE - img.width) / 2));
      img.setDepth((o.y + fp.h) * TILE - 1);
      img.setData('kind', o.kind);
      this.props.push(img);
      this.zoneObjects.push(img);
    }
    this.night.rebuild(zone.rows[0]!.length * TILE, zone.rows.length * TILE);
  }

  private readInput(): Input {
    const k = this.keys;
    const dx = (k.D!.isDown || k.RIGHT!.isDown ? 1 : 0) - (k.A!.isDown || k.LEFT!.isDown ? 1 : 0);
    const dy = (k.S!.isDown || k.DOWN!.isDown ? 1 : 0) - (k.W!.isDown || k.UP!.isDown ? 1 : 0);
    return { dx: dx as Input['dx'], dy: dy as Input['dy'] };
  }

  private send(zone: ZoneId, now: number) {
    const msg = { x: this.me.x, y: this.me.y, zone, facing: this.facing, moving: this.moving };
    const sig = JSON.stringify(msg);
    if (sig === this.lastSent) return;
    this.room.send('move', msg);
    this.lastSent = sig;
    this.lastSendAt = now;
    this.sinceSend = 0;
  }

  update(time: number, delta: number) {
    const state = this.room.state;
    const mine = this.myState();
    if (!this.ready) {
      if (!mine || !state) return;
      this.buildZone(mine.zone as ZoneId);
      this.me = { x: mine.x, y: mine.y };
      this.facing = mine.facing as Facing;
      this.myView = new PlayerView(this, mine, true);
      this.ready = true;
    }
    if (!mine) return;
    if (!this.nameShown && state.name) {
      this.hud.setWorldName(state.name);
      this.nameShown = true;
    }

    // Adopt the server's word after a faint, a correction we missed, or a zone change it made.
    const settled = time - this.zoneChangeAt > 800 && time - this.lastSendAt > 400;
    if (settled && mine.zone !== this.zone.id) {
      this.buildZone(mine.zone as ZoneId);
      this.me = { x: mine.x, y: mine.y };
    } else if (settled && Math.hypot(mine.x - this.me.x, mine.y - this.me.y) > 40) {
      this.me = { x: mine.x, y: mine.y };
    }

    // Movement, predicted locally.
    const input = this.readInput();
    const wasMoving = this.moving;
    this.moving = !!(input.dx || input.dy);
    this.facing = facingFor(input, this.facing);
    if (this.moving) this.me = stepPlayer(this.me, input, delta, this.zone);
    this.sinceSend += delta;

    const exit = this.moving ? findExit(this.zone, this.me.x, this.me.y) : null;
    if (exit) {
      this.lastSent = '';
      this.send(exit.to, time);
      this.buildZone(exit.to);
      this.me = centre(exit.spawn);
      this.zoneChangeAt = time;
      this.lastSent = JSON.stringify({ x: this.me.x, y: this.me.y, zone: exit.to, facing: this.facing, moving: this.moving });
    } else if (this.sinceSend >= SEND_EVERY_MS || (wasMoving && !this.moving)) {
      this.send(this.zone.id, time);
    }

    // Actions.
    const J = Phaser.Input.Keyboard.JustDown;
    if (J(this.keys.Z!)) this.room.send('emote', 'jump');
    if (J(this.keys.X!)) this.room.send('emote', 'sit');
    if (J(this.keys.C!)) this.room.send('emote', 'sleep');
    if (J(this.keys.P!)) this.hud.togglePlayers();
    const door = this.zone.houseDoor;
    const nearDoor = !!door && Math.hypot(this.me.x - centre(door).x, this.me.y - centre(door).y) <= BED_REACH;
    const nearStall = this.nearStall();
    if (!nearStall && this.shop.open) this.shop.close();
    const pressed = this.actionPressed;
    this.actionPressed = false;
    if (nearDoor && !mine.inBed) {
      this.hud.setPrompt('E', 'Go to bed');
      if (pressed) this.room.send('bed');
    } else if (nearStall && !this.shop.open) {
      this.hud.setPrompt('E', 'Open the shop');
      if (pressed) this.shop.show();
    } else {
      this.hud.setPrompt(null);
      if (pressed) this.useTarget();
    }

    // Farm: soil, crops, and the cursor on the plot tile in front of you.
    this.farmView.sync(this.zone, state.soil);
    const t = this.targetTile();
    const onPlot = this.zone.id === 'farm' && this.zone.rows[t.y]?.[t.x] === ':';
    this.farmView.target(onPlot ? t : null);
    if (mine.inBed && !this.wasInBed) this.hud.toasts.show('Sleeping… the day ends when everyone’s in bed', 4500);
    this.wasInBed = mine.inBed;

    // Draw me. Walking clears an emote straight away, before the server confirms.
    this.myView!.update(this.me.x, this.me.y, {
      ...mine,
      facing: this.facing,
      moving: this.moving,
      emote: this.moving ? '' : mine.emote,
      inBed: mine.inBed && !this.moving,
    }, delta);

    // Draw everyone else in this zone, a little behind real time so they move smoothly.
    const seen = new Set<string>();
    state.players.forEach((p: PlayerStateLike, sid: string) => {
      if (sid === this.room.sessionId || p.zone !== this.zone.id) return;
      seen.add(sid);
      let r = this.remotes.get(sid);
      if (!r) {
        r = { view: new PlayerView(this, p, false), samples: [] };
        this.remotes.set(sid, r);
      }
      const last = r.samples[r.samples.length - 1];
      if (!last || last.x !== p.x || last.y !== p.y) r.samples.push({ t: time, x: p.x, y: p.y });
      if (r.samples.length > 20) r.samples.splice(0, r.samples.length - 20);
      const at = time - INTERP_DELAY_MS;
      let pos = r.samples[r.samples.length - 1]!;
      for (let i = r.samples.length - 1; i > 0; i--) {
        const a = r.samples[i - 1]!, b = r.samples[i]!;
        if (a.t <= at && at <= b.t) {
          const k = (at - a.t) / (b.t - a.t || 1);
          pos = { t: at, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
          break;
        }
        if (at < a.t) pos = a;
      }
      r.view.update(pos.x, pos.y, p, delta);
    });
    for (const [sid, r] of this.remotes) {
      if (!seen.has(sid)) {
        r.view.destroy();
        this.remotes.delete(sid);
      }
    }

    // Water ripples.
    this.waterClock += delta;
    if (this.waterClock > 600) {
      this.waterClock = 0;
      for (const t of this.waterTiles) t.index = t.index === TILE_FRAMES.water1 ? TILE_FRAMES.water2 : TILE_FRAMES.water1;
    }

    // Camera: follow me, but keep a small map centred instead of showing past its edge.
    const cam = this.cameras.main;
    const vw = cam.width / ZOOM, vh = cam.height / ZOOM;
    const mw = this.zone.rows[0]!.length * TILE, mh = this.zone.rows.length * TILE;
    const cx = mw <= vw ? mw / 2 : Phaser.Math.Clamp(this.me.x, vw / 2, mw - vw / 2);
    const cy = mh <= vh ? mh / 2 : Phaser.Math.Clamp(this.me.y, vh / 2, mh - vh / 2);
    cam.centerOn(Math.round(cx), Math.round(cy));

    // HUD.
    this.hud.setTime(formatClock({ day: state.day, minute: state.minute }));
    this.clockView.set({ day: state.day, minute: state.minute });
    this.night.set(state.minute);
    this.sinceList += delta;
    if (this.sinceList > 250 && this.hud.playersOpen) {
      this.sinceList = 0;
      const rows: Parameters<Hud['renderPlayers']>[0] = [];
      state.players.forEach((p: PlayerStateLike, sid: string) =>
        rows.push({ sessionId: sid, nickname: p.nickname, species: p.species, isOwner: p.isOwner, isMe: sid === this.room.sessionId }),
      );
      this.hud.renderPlayers(rows, mine.isOwner, sid => this.room.send('kick', sid));
    }
  }
}
