import { CROPS, type CropId } from './items';
import type { ZoneMap } from './maps';

export interface Crop {
  id: CropId;
  /** Watered days since planting, or since the last harvest for crops that fruit again. */
  days: number;
  harvested: number;
}
export interface Plot {
  watered: boolean;
  crop: Crop | null;
}
/** Tilled tiles only, keyed "x,y". */
export type Farm = Record<string, Plot>;

export const GAME_DAY_MS = 24 * 60 * 1000;
const key = (x: number, y: number) => `${x},${y}`;

/** Days a crop needs before its next harvest. */
function growth(c: Crop): number {
  const info = CROPS[c.id];
  return c.harvested > 0 && info.regrowDays ? info.regrowDays : info.days;
}

/** 0, 1, 2 while growing; 3 when ripe. */
export function cropStage(c: Crop): 0 | 1 | 2 | 3 {
  const g = growth(c);
  if (c.days >= g) return 3;
  return Math.min(2, Math.floor((c.days / g) * 3)) as 0 | 1 | 2;
}

export function till(farm: Farm, zone: ZoneMap, x: number, y: number): Farm | null {
  if (zone.id !== 'farm' || zone.rows[y]?.[x] !== ':' || farm[key(x, y)]) return null;
  return { ...farm, [key(x, y)]: { watered: false, crop: null } };
}

export function water(farm: Farm, x: number, y: number): Farm | null {
  const p = farm[key(x, y)];
  if (!p) return null;
  return { ...farm, [key(x, y)]: { ...p, watered: true } };
}

export function plant(farm: Farm, x: number, y: number, crop: CropId): Farm | null {
  const p = farm[key(x, y)];
  if (!p || p.crop) return null;
  return { ...farm, [key(x, y)]: { ...p, crop: { id: crop, days: 0, harvested: 0 } } };
}

export function harvest(farm: Farm, x: number, y: number): { farm: Farm; item: CropId } | null {
  const p = farm[key(x, y)];
  if (!p?.crop || cropStage(p.crop) !== 3) return null;
  const c = p.crop;
  const next: Crop | null = CROPS[c.id].regrowDays ? { id: c.id, days: 0, harvested: c.harvested + 1 } : null;
  return { farm: { ...farm, [key(x, y)]: { ...p, crop: next } }, item: c.id };
}

/** Morning: watered crops grow a day (ripe ones stay ripe), then the soil dries. */
export function nextDay(farm: Farm): Farm {
  const out: Farm = {};
  for (const [k, p] of Object.entries(farm)) {
    const crop = p.crop && p.watered ? { ...p.crop, days: Math.min(p.crop.days + 1, growth(p.crop)) } : p.crop;
    out[k] = { watered: false, crop };
  }
  return out;
}

/** While the world was empty: crops on watered soil grow a day per game day, up to ripe; the soil stays wet. */
export function catchUp(farm: Farm, elapsedMs: number): Farm {
  const days = Math.floor(Math.max(0, elapsedMs) / GAME_DAY_MS);
  if (days < 1) return farm;
  const out: Farm = {};
  for (const [k, p] of Object.entries(farm)) {
    const crop = p.crop && p.watered ? { ...p.crop, days: Math.min(p.crop.days + days, growth(p.crop)) } : p.crop;
    out[k] = { ...p, crop };
  }
  return out;
}
