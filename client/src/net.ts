import { Client, type Room } from '@colyseus/sdk';
import { normalizeCode, type Species } from '@ruminate/shared';

/** Where the game server is: an explicit VITE_SERVER_URL, port 2567 next to Vite in dev, or this page's own origin. */
export function serverUrl(): string {
  const env = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (env) return env.replace(/\/$/, '');
  if (location.port === '5173') return `${location.protocol}//${location.hostname}:2567`;
  return location.origin;
}

const KEY_STORAGE = 'ruminate.playerKey';
let memoryKey: string | null = null;

/** This browser's secret player key: 32 hex characters, kept in localStorage when it can be. */
export function playerKey(): string {
  try {
    const saved = localStorage.getItem(KEY_STORAGE);
    if (saved && /^[0-9a-f]{32}$/.test(saved)) return saved;
  } catch {
    /* storage blocked */
  }
  if (!memoryKey) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    memoryKey = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  try {
    localStorage.setItem(KEY_STORAGE, memoryKey);
  } catch {
    /* storage blocked: the key lasts for this tab only */
  }
  return memoryKey;
}

export class FriendlyError extends Error {}

const MESSAGES: Record<string, string> = {
  WORLD_NOT_FOUND: 'No world with that code.',
  WORLD_FULL: 'This world is full (8/8).',
  BANNED: 'You can’t join this world.',
  BAD_NAME: 'Pick a nickname first.',
  BAD_CODE: 'Codes look like MOON-4823.',
};

function friendly(err: unknown): FriendlyError {
  if (err instanceof FriendlyError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  for (const [code, text] of Object.entries(MESSAGES)) if (msg.includes(code)) return new FriendlyError(text);
  if (/fetch|network|ECONNREFUSED|Failed/i.test(msg)) return new FriendlyError('Can’t reach the game server. Is it running?');
  return new FriendlyError('Something went wrong. Try again.');
}

export async function createWorld(name: string): Promise<string> {
  try {
    const res = await fetch(`${serverUrl()}/api/worlds`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, playerKey: playerKey() }),
    });
    const body = (await res.json()) as { code?: string; error?: string };
    if (!res.ok || !body.code) throw new FriendlyError(body.error ?? 'Couldn’t create the world.');
    return body.code;
  } catch (e) {
    throw friendly(e);
  }
}

export async function joinWorld(input: string, nickname: string, species: Species): Promise<Room> {
  const code = normalizeCode(input);
  if (!code) throw new FriendlyError(MESSAGES.BAD_CODE);
  try {
    const res = await fetch(`${serverUrl()}/api/worlds/${encodeURIComponent(code)}`);
    if (res.status === 404) throw new FriendlyError(MESSAGES.WORLD_NOT_FOUND);
    return await new Client(serverUrl()).joinOrCreate('world', { code, playerKey: playerKey(), nickname, species });
  } catch (e) {
    throw friendly(e);
  }
}
