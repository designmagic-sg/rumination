import { createServer } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type Room } from '@colyseus/sdk';
import { MAX_PLAYERS, TILE, ZONES } from '@ruminate/shared';
import { createGameServer, type GameServer } from '../src/main';

const KEY = (n: number) => n.toString(16).padStart(32, '0');
const freePort = () =>
  new Promise<number>(resolve => {
    const s = createServer();
    s.listen(0, () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
  });
const waitFor = async (check: () => boolean, ms = 2000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise(r => setTimeout(r, 20));
  }
};

let server: GameServer;
let base: string;
const rooms: Room[] = [];

beforeAll(async () => {
  const port = await freePort();
  server = await createGameServer({ port, dbPath: ':memory:', timeScale: 60, limits: { lookupsPerMinute: 80, createsPerMinute: 40 } });
  base = `http://localhost:${port}`;
});

afterAll(async () => {
  for (const r of rooms) await r.leave().catch(() => {});
  await server.close();
});

async function createWorld(name = 'Test'): Promise<string> {
  const res = await fetch(`${base}/api/worlds`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, playerKey: KEY(1) }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { code: string }).code;
}

async function join(code: string, n: number, species = 'ding') {
  const room = await new Client(base).joinOrCreate('world', { code, playerKey: KEY(n), nickname: `P${n}`, species });
  rooms.push(room);
  return room;
}

describe('HTTP', () => {
  it('creates a world and finds it, with a loosely typed code', async () => {
    const code = await createWorld('Cosy');
    const loose = code.toLowerCase().replace('-', ' ');
    const res = await fetch(`${base}/api/worlds/${encodeURIComponent(loose)}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ code, name: 'Cosy', online: 0 });
  });

  it('404s an unknown world', async () => {
    expect((await fetch(`${base}/api/worlds/NOPE-2222`)).status).toBe(404);
  });

  it('refuses a world with no name or a bad player key', async () => {
    const post = (body: unknown) =>
      fetch(`${base}/api/worlds`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    expect((await post({ name: '  ', playerKey: KEY(1) })).status).toBe(400);
    expect((await post({ name: 'Ok', playerKey: 'nope' })).status).toBe(400);
  });

  it('allows other origins', async () => {
    const res = await fetch(`${base}/api/worlds/NOPE-2222`, { headers: { origin: 'http://localhost:5173' } });
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });
});

describe('world room', () => {
  it('lets two players see each other move', async () => {
    const code = await createWorld();
    const a = await join(code, 2);
    const b = await join(code, 3, 'chime');
    await waitFor(() => b.state.players?.size === 2);
    const start = { x: ZONES.farm.spawn.x * TILE + 8, y: ZONES.farm.spawn.y * TILE + 8 };
    await new Promise(r => setTimeout(r, 120));
    a.send('move', { x: start.x + 5, y: start.y, zone: 'farm', facing: 'right', moving: true });
    await waitFor(() => b.state.players.get(a.sessionId)?.x === start.x + 5, 500);
    await a.leave();
    await b.leave();
  });

  it('refuses a code that was not normalised, instead of opening a second room', async () => {
    const code = await createWorld();
    await expect(join(code.toLowerCase(), 4)).rejects.toThrow(/BAD_CODE/);
  });

  it('refuses an unknown world', async () => {
    await expect(join('NOPE-2222', 5)).rejects.toThrow(/WORLD_NOT_FOUND/);
  });

  it('ninth join is refused with WORLD_FULL', async () => {
    const code = await createWorld();
    const eight: Room[] = [];
    for (let i = 0; i < MAX_PLAYERS; i++) eight.push(await join(code, 100 + i));
    await expect(join(code, 200)).rejects.toThrow(/WORLD_FULL/);
    // Someone already in (say, refreshing their tab) replaces their old character instead.
    const again = await join(code, 100);
    await waitFor(() => again.state.players?.size === 8);
    for (const r of eight.slice(1)) await r.leave();
    await again.leave();
  });

  it('world saves and pauses when the last player disconnects', async () => {
    const code = await createWorld();
    const a = await join(code, 6);
    await waitFor(() => (a.state.minute ?? 0) > 400, 4000); // timeScale 60: about a game hour per second
    const minute = a.state.minute;
    await a.leave(false); // drop without saying goodbye
    await waitFor(() => server.store.load(code)!.emptySince !== null, 2000);
    const saved = server.store.load(code)!;
    // Synced numbers travel as float32, so compare whole minutes.
    expect(Math.floor(saved.clock.minute)).toBeGreaterThanOrEqual(Math.floor(minute));
    expect(saved.players[KEY(6)]).toBeDefined();
    await new Promise(r => setTimeout(r, 300));
    expect(server.store.load(code)!.clock.minute).toBe(saved.clock.minute); // paused
    const again = await join(code, 6);
    await waitFor(() => again.state.minute !== undefined);
    expect(Math.floor(again.state.minute)).toBe(Math.floor(saved.clock.minute));
    await again.leave();
  });

  it('disconnects a client that floods the room with messages', async () => {
    const code = await createWorld();
    const a = await join(code, 8);
    let left = false;
    a.onLeave(() => (left = true));
    for (let i = 0; i < 300; i++) a.send('emote', 'jump');
    await waitFor(() => left, 3000);
  });

  it('owner can remove a player, who is then banned', async () => {
    const code = await createWorld();
    const owner = await join(code, 1);
    const guest = await join(code, 7);
    let kicked = false;
    guest.onMessage('kicked', () => (kicked = true));
    await waitFor(() => owner.state.players?.size === 2);
    owner.send('kick', guest.sessionId);
    await waitFor(() => kicked);
    await expect(join(code, 7)).rejects.toThrow(/BANNED/);
    await owner.leave();
  });
});

// Runs last: it uses up this address's lookup allowance for the minute.
describe('rate limits', () => {
  it('stops one address from scanning for world codes', async () => {
    let refused = 0;
    for (let i = 0; i < 100; i++) {
      const res = await fetch(`${base}/api/worlds/MOON-${2222 + (i % 7)}`);
      if (res.status === 429) refused++;
    }
    expect(refused).toBeGreaterThan(0);
  });

  it('also stops join attempts once the allowance is used up', async () => {
    await expect(join('LEAF-2345', 300)).rejects.toThrow(/RATE_LIMITED|429|Too many/);
  });
});
