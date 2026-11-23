import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { defineRoom, defineServer, matchMaker } from 'colyseus';
import { mountApi } from './http';
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
}): Promise<GameServer> {
  if (opts.dbPath !== ':memory:') mkdirSync(dirname(opts.dbPath), { recursive: true });
  const store = openStore(opts.dbPath);
  const deps = { store, timeScale: opts.timeScale ?? 1 };
  class BoundWorldRoom extends WorldRoom {
    deps = deps;
  }

  const server = defineServer({
    greet: false,
    rooms: { world: defineRoom(BoundWorldRoom).filterBy(['code']) },
    express: app => {
      mountApi(app, store, code => activeWorlds.get(code)?.clients.length ?? 0);
      if (opts.clientDist && existsSync(opts.clientDist)) app.use(express.static(opts.clientDist));
    },
  });
  await server.listen(opts.port);

  return {
    store,
    async close() {
      await matchMaker.gracefullyShutdown().catch(() => {});
      await server.gracefullyShutdown(false).catch(() => {});
      store.close();
    },
  };
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
