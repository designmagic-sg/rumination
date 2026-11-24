import { DatabaseSync } from 'node:sqlite';
import { generateCode, newWorldSave, type WorldSave } from '@ruminate/shared';

export interface WorldStore {
  createWorld(name: string, ownerKey: string): WorldSave;
  load(code: string): WorldSave | null;
  save(world: WorldSave): void;
  exists(code: string): boolean;
  updatedAt(code: string): number | null;
  close(): void;
}

/** How many codes to try before giving up, so a full code space can't hang the server. */
const MAX_CODE_TRIES = 100;

export function openStore(path: string, makeCode: () => string = generateCode): WorldStore {
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE IF NOT EXISTS worlds (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  const insert = db.prepare('INSERT INTO worlds (code, name, data, updated_at) VALUES (?, ?, ?, ?)');
  const update = db.prepare('UPDATE worlds SET name = ?, data = ?, updated_at = ? WHERE code = ?');
  const select = db.prepare('SELECT data, updated_at FROM worlds WHERE code = ?');
  let last = 0;
  // Strictly increasing timestamps, so two saves in the same millisecond still order.
  const stamp = () => (last = Math.max(Date.now(), last + 1));

  const store: WorldStore = {
    createWorld(name, ownerKey) {
      for (let i = 0; i < MAX_CODE_TRIES; i++) {
        const code = makeCode();
        if (store.exists(code)) continue;
        const world = newWorldSave(code, name, ownerKey);
        insert.run(code, name, JSON.stringify(world), stamp());
        return world;
      }
      throw new Error('NO_FREE_CODES');
    },
    load(code) {
      const row = select.get(code) as { data: string } | undefined;
      return row ? (JSON.parse(row.data) as WorldSave) : null;
    },
    save(world) {
      update.run(world.name, JSON.stringify(world), stamp(), world.code);
    },
    exists(code) {
      return select.get(code) !== undefined;
    },
    updatedAt(code) {
      const row = select.get(code) as { updated_at: number } | undefined;
      return row ? Number(row.updated_at) : null;
    },
    close() {
      db.close();
    },
  };
  return store;
}
