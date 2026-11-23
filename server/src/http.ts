import express, { type Application } from 'express';
import { cleanNickname, isPlayerKey, normalizeCode } from '@ruminate/shared';
import type { WorldStore } from './store';

/** POST /api/worlds and GET /api/worlds/:code. `online` counts who is in a world now. */
export function mountApi(app: Application, store: WorldStore, online: (code: string) => number) {
  app.use('/api', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    if (req.method === 'OPTIONS') return void res.sendStatus(204);
    next();
  });
  app.use('/api', express.json({ limit: '4kb' }));

  app.post('/api/worlds', (req, res) => {
    const name = cleanNickname(String(req.body?.name ?? ''));
    const playerKey = req.body?.playerKey;
    if (!name) return void res.status(400).json({ error: 'Give your world a name.' });
    if (!isPlayerKey(playerKey)) return void res.status(400).json({ error: 'Bad player key.' });
    const world = store.createWorld(name, playerKey);
    res.status(201).json({ code: world.code });
  });

  app.get('/api/worlds/:code', (req, res) => {
    const code = normalizeCode(String(req.params.code ?? ''));
    const world = code ? store.load(code) : null;
    if (!world) return void res.status(404).json({ error: 'No world with that code.' });
    res.json({ code: world.code, name: world.name, online: online(world.code) });
  });
}
