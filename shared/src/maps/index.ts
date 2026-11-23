import { FARM } from './farm';
import { MARKET } from './market';
import { OBJECT_FOOTPRINT, SOLID_TILES, TILE, type Exit, type ZoneId, type ZoneMap } from './types';

export * from './types';

export const ZONES: Record<ZoneId, ZoneMap> = { farm: FARM, market: MARKET };

export function isZoneId(v: unknown): v is ZoneId {
  return typeof v === 'string' && Object.hasOwn(ZONES, v);
}

/** Is this world-pixel point blocked? Anything outside the map is. */
export function isSolid(zone: ZoneMap, px: number, py: number): boolean {
  if (!Number.isFinite(px) || !Number.isFinite(py)) return true;
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  const row = zone.rows[ty];
  if (tx < 0 || ty < 0 || row === undefined || tx >= row.length) return true;
  if (SOLID_TILES.has(row[tx]!)) return true;
  for (const o of zone.objects) {
    const fp = OBJECT_FOOTPRINT[o.kind];
    const top = o.y + fp.h - fp.solidRows;
    if (tx >= o.x && tx < o.x + fp.w && ty >= top && ty < o.y + fp.h) return true;
  }
  return false;
}

export function findExit(zone: ZoneMap, px: number, py: number): Exit | null {
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  return zone.exits.find(e => tx >= e.x && tx < e.x + e.w && ty >= e.y && ty < e.y + e.h) ?? null;
}
