import type { IncomingMessage } from 'node:http';
import express, { type Application, type RequestHandler } from 'express';
import { cleanNickname, isPlayerKey, normalizeCode } from '@ruminate/shared';
import { createLimiter, type Limiter } from './limiter';
import type { WorldStore } from './store';

export interface Limits {
  /** World lookups and join attempts per address per minute. */
  lookupsPerMinute: number;
  /** New worlds per address per minute. */
  createsPerMinute: number;
}

export const DEFAULT_LIMITS: Limits = { lookupsPerMinute: 30, createsPerMinute: 10 };

export const perMinute = (limit: number) => createLimiter({ limit, windowMs: 60_000 });

export const addressOf = (req: IncomingMessage) => req.socket.remoteAddress ?? 'unknown';

export const RATE_LIMITED = 'RATE_LIMITED: Too many tries. Wait a minute and try again.';

function guard(limiter: Limiter): RequestHandler {
  return (req, res, next) => {
    if (limiter.hit(addressOf(req))) return next();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(429).json({ error: RATE_LIMITED });
  };
}

/**
 * POST /api/worlds and GET /api/worlds/:code. `online` counts who is in a world now.
 * `lookups` is shared with join attempts (see main.ts), so looking up codes and trying to join
 * draw on one allowance and codes can't be found by guessing.
 */
export function mountApi(app: Application, store: WorldStore, online: (code: string) => number, lookups: Limiter, creates: Limiter) {
  app.use('/api', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    if (req.method === 'OPTIONS') return void res.sendStatus(204);
    next();
  });
  app.use('/api', express.json({ limit: '4kb' }));

  app.post('/api/worlds', guard(creates), (req, res) => {
    const name = cleanNickname(String(req.body?.name ?? ''));
    const playerKey = req.body?.playerKey;
    if (!name) return void res.status(400).json({ error: 'Give your world a name.' });
    if (!isPlayerKey(playerKey)) return void res.status(400).json({ error: 'Bad player key.' });
    try {
      res.status(201).json({ code: store.createWorld(name, playerKey).code });
    } catch {
      res.status(503).json({ error: 'No free world codes right now. Try again later.' });
    }
  });

  app.get('/api/worlds/:code', guard(lookups), (req, res) => {
    const code = normalizeCode(String(req.params.code ?? ''));
    const world = code ? store.load(code) : null;
    if (!world) return void res.status(404).json({ error: 'No world with that code.' });
    res.json({ code: world.code, name: world.name, online: online(world.code) });
  });
}
