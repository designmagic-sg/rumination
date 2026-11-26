import { Room, ServerError, type Client } from 'colyseus';
import { MAX_PLAYERS, isPlayerKey, normalizeCode, type Species } from '@ruminate/shared';
import { WorldState } from './schema';
import { WorldSim } from './sim';
import type { WorldStore } from './store';

export interface JoinOptions {
  code: string;
  playerKey: string;
  nickname: string;
  species: Species;
}

const SAVE_EVERY_MS = 30_000;
const TICK_MS = 250;
const CLOSE_KICKED = 4001;
const CLOSE_REPLACED = 4002;

/** Worlds running in this process, by code. One room per world. */
export const activeWorlds = new Map<string, WorldRoom>();

export interface RoomDeps {
  store: WorldStore;
  timeScale: number;
}

export class WorldRoom extends Room<{ state: WorldState }> {
  /** One spare seat so someone already in can rejoin (a refreshed tab) and replace themselves; WorldSim enforces 8 people. */
  maxClients = MAX_PLAYERS + 1;
  /** An honest client sends about 15 moves a second; anything far past that is a flood. */
  maxMessagesPerSecond = 40;
  /** Set by createGameServer on a per-server subclass. */
  deps!: RoomDeps;
  private sim!: WorldSim;
  private code = '';

  onCreate(options: JoinOptions) {
    const code = normalizeCode(String(options?.code ?? ''));
    if (!code || code !== options.code) throw new ServerError(400, 'BAD_CODE');
    // A full world is locked, and joinOrCreate would then try to open a second room for it.
    if (activeWorlds.has(code)) throw new ServerError(403, 'WORLD_FULL');
    const save = this.deps.store.load(code);
    if (!save) throw new ServerError(404, 'WORLD_NOT_FOUND');

    this.code = code;
    this.roomId = code;
    activeWorlds.set(code, this);
    this.state = new WorldState();
    this.sim = new WorldSim(this.state, save);

    this.onMessage('move', (client, msg) => {
      const r = this.sim.move(client.sessionId, msg);
      if (!r.ok) client.send('snap', r.snapTo);
    });
    this.onMessage('emote', (client, kind) => this.sim.emote(client.sessionId, kind));
    this.onMessage('bed', client => {
      if (!this.sim.goToBed(client.sessionId)) client.send('toast', 'Stand by the house door to go to bed.');
    });
    this.onMessage('kick', (client, target) => {
      if (typeof target !== 'string') return;
      const key = this.sim.kick(client.sessionId, target);
      const victim = key ? this.clients.get(target) : undefined;
      if (victim) {
        victim.send('kicked', 'You can’t join this world.');
        victim.leave(CLOSE_KICKED);
      }
    });
    const act = (client: Client, r: { ok: boolean; toast?: string }) => {
      if (r.toast) client.send('toast', r.toast);
      this.sendInventory(client);
    };
    // The client says when it's listening; the join-time inventory message can arrive before that.
    this.onMessage('ready', client => this.sendInventory(client));
    this.onMessage('use', (client, msg) => act(client, this.sim.farmAction(client.sessionId, msg)));
    this.onMessage('buy', (client, msg) => act(client, this.sim.buy(client.sessionId, msg)));
    this.onMessage('sell', (client, msg) => act(client, this.sim.sell(client.sessionId, msg)));
    this.onMessage('swap', (client, msg) => {
      const m = (msg ?? {}) as { a?: unknown; b?: unknown };
      this.sim.swap(client.sessionId, m.a, m.b);
      this.sendInventory(client);
    });
    this.onMessage('*', () => {});

    this.setSimulationInterval(delta => {
      const event = this.sim.tick(delta * this.deps.timeScale);
      if (event) this.broadcast('event', { kind: event, day: this.state.day });
    }, TICK_MS);
    this.clock.setInterval(() => this.persist(), SAVE_EVERY_MS);
  }

  onJoin(client: Client, options: JoinOptions) {
    if (!isPlayerKey(options?.playerKey)) throw new ServerError(400, 'BAD_KEY');
    const r = this.sim.join(client.sessionId, options.playerKey, options.nickname, options.species);
    if (!r.ok) throw new ServerError(403, r.error);
    this.sendInventory(client);
    if (r.replaced) {
      const old = this.clients.get(r.replaced);
      if (old) {
        old.send('kicked', 'You joined this world from somewhere else.');
        old.leave(CLOSE_REPLACED);
      }
    }
  }

  /** A player's bag and purse go to them alone. */
  private sendInventory(client: Client) {
    const inv = this.sim.inventoryOf(client.sessionId);
    if (inv) client.send('inventory', inv);
  }

  onLeave(client: Client) {
    this.sim.leave(client.sessionId);
    this.persist();
  }

  onDispose() {
    if (this.sim) this.persist();
    if (activeWorlds.get(this.code) === this) activeWorlds.delete(this.code);
  }

  private persist() {
    this.deps.store.save(this.sim.toSave());
  }
}
