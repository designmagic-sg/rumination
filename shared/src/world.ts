import type { ZoneId } from './maps';
import type { Facing } from './movement';
import { DAY_START, type Clock } from './time';

export type Species = 'ding' | 'chime' | 'jingle' | 'gong';
export const SPECIES: readonly Species[] = ['ding', 'chime', 'jingle', 'gong'];
export const SPECIES_NAMES: Record<Species, string> = { ding: 'Ding', chime: 'Chime', jingle: 'Jingle', gong: 'Gong' };

export type Emote = 'jump' | 'sit' | 'sleep';
export const EMOTES: readonly Emote[] = ['jump', 'sit', 'sleep'];

export const MAX_PLAYERS = 8;

export interface PlayerSave {
  nickname: string;
  species: Species;
  zone: ZoneId;
  x: number;
  y: number;
  facing: Facing;
}

export interface WorldSave {
  code: string;
  name: string;
  ownerKey: string;
  clock: Clock;
  /** Keyed by each player's secret key. */
  players: Record<string, PlayerSave>;
  banned: string[];
  /** When the last player left (ms since epoch), for step 2's catch-up; null while anyone is online. */
  emptySince: number | null;
}

export function newWorldSave(code: string, name: string, ownerKey: string): WorldSave {
  return { code, name, ownerKey, clock: { day: 1, minute: DAY_START }, players: {}, banned: [], emptySince: null };
}

export function isSpecies(v: unknown): v is Species {
  return typeof v === 'string' && (SPECIES as readonly string[]).includes(v);
}

export function isEmote(v: unknown): v is Emote {
  return typeof v === 'string' && (EMOTES as readonly string[]).includes(v);
}

/** A player key is 32 lowercase hex characters. */
export function isPlayerKey(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{32}$/.test(v);
}
