export const TILE = 16;

export type ZoneId = 'farm' | 'market';

export type ObjectKind = 'house' | 'shed' | 'stall' | 'board' | 'sign' | 'lamp' | 'tree' | 'rock';

/** A building or prop, placed by its top-left tile. */
export interface ZoneObject {
  kind: ObjectKind;
  x: number;
  y: number;
}

/** A tile rectangle that leads to another zone, landing on `spawn` there. */
export interface Exit {
  x: number;
  y: number;
  w: number;
  h: number;
  to: ZoneId;
  spawn: { x: number; y: number };
}

/**
 * A zone as a text map. Tile characters:
 * `.` grass, `,` flower grass, `=` path, `:` farm plot, `~` water, `#` fence, `b` bush, `_` wooden bridge.
 */
export interface ZoneMap {
  id: ZoneId;
  name: string;
  rows: string[];
  objects: ZoneObject[];
  exits: Exit[];
  spawn: { x: number; y: number };
  houseDoor?: { x: number; y: number };
}

/** Size in tiles. Only the bottom `solidRows` rows block movement, so you can walk behind roofs and treetops. */
export const OBJECT_FOOTPRINT: Record<ObjectKind, { w: number; h: number; solidRows: number }> = {
  house: { w: 6, h: 5, solidRows: 3 },
  shed: { w: 4, h: 4, solidRows: 2 },
  stall: { w: 4, h: 3, solidRows: 1 },
  board: { w: 2, h: 2, solidRows: 1 },
  sign: { w: 1, h: 1, solidRows: 1 },
  lamp: { w: 1, h: 2, solidRows: 1 },
  tree: { w: 2, h: 3, solidRows: 1 },
  rock: { w: 1, h: 1, solidRows: 1 },
};

export const SOLID_TILES = new Set(['~', '#', 'b']);
