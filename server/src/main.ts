import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineRoom, defineServer, matchMaker } from 'colyseus';
import { DEFAULT_LIMITS, RATE_LIMITED, addressOf, mountApi, perMinute, type Limits } from './http';
import type { Limiter } from './limiter';
import { WorldRoom, activeWorlds } from './room';
import { openStore, type WorldStore } from './store';

export interface GameServer {
  store: WorldStore;
  close(): Promise<void>;
}

export async function createGameServer(opts: {
  port: number;
  dbPath: string;
  clientDist?: string;
  timeScale?: number;
  limits?: Limits;
}): Promise<GameServer> {
  if (opts.dbPath !== ':memory:') mkdirSync(dirname(opts.dbPath), { recursive: true });
  const store = openStore(opts.dbPath);
  const deps = { store, timeScale: opts.timeScale ?? 1 };
  const limits = opts.limits ?? DEFAULT_LIMITS;
  const lookups = perMinute(limits.lookupsPerMinute);
  const creates = perMinute(limits.createsPerMinute);
  class BoundWorldRoom extends WorldRoom {
    deps = deps;
  }

  const server = defineServer({
    greet: false,
    rooms: { world: defineRoom(BoundWorldRoom).filterBy(['code']) },
    express: app => {
      mountApi(app, store, code => activeWorlds.get(code)?.clients.length ?? 0, lookups, creates);
      if (opts.clientDist && existsSync(opts.clientDist)) app.use(express.static(opts.clientDist));
    },
  });
  await server.listen(opts.port);
  limitJoinAttempts(server.transport.server, lookups);

  return {
    store,
    async close() {
      await matchMaker.gracefullyShutdown().catch(() => {});
      await server.gracefullyShutdown(false).catch(() => {});
      store.close();
    },
  };
}

/**
 * Colyseus answers its matchmaking requests (/matchmake/...) before Express sees them, so the
 * join-attempt limit wraps the HTTP server's request handling directly.
 */
function limitJoinAttempts(http: { listeners(e: 'request'): Function[]; removeAllListeners(e: 'request'): unknown; on(e: 'request', l: (req: IncomingMessage, res: ServerResponse) => void): unknown } | undefined, lookups: Limiter) {
  if (!http) throw new Error('No HTTP server to guard');
  const handlers = http.listeners('request');
  http.removeAllListeners('request');
  http.on('request', (req, res) => {
    if (req.method === 'POST' && req.url?.startsWith('/matchmake/') && !lookups.hit(addressOf(req))) {
      res.writeHead(429, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      res.end(JSON.stringify({ code: 429, error: RATE_LIMITED }));
      return;
    }
    for (const h of handlers) h.call(http, req, res);
  });
}

const here = dirname(fileURLToPath(import.meta.url));
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 2567);
  await createGameServer({
    port,
    dbPath: process.env.DB_PATH ?? resolve(here, '../data/worlds.db'),
    clientDist: resolve(here, '../../client/dist'),
    timeScale: Number(process.env.TIME_SCALE ?? 1),
  });
  console.log(`RumiNation server on http://localhost:${port}`);
}
