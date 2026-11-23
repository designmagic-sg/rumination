/** Frame order of public/tiles/tiles.png; must match TILE_FRAMES in art/make_tiles.py. */
export const TILE_FRAMES = {
  grass: 0,
  grass2: 1,
  flowers: 2,
  path: 3,
  plot: 4,
  water1: 5,
  water2: 6,
  fence: 7,
  bush: 8,
  bridge: 9,
} as const;

/** Which frame a map character draws as. Grass alternates between two looks so it doesn't repeat. */
export function frameFor(ch: string, tx: number, ty: number): number {
  switch (ch) {
    case ',': return TILE_FRAMES.flowers;
    case '=': return TILE_FRAMES.path;
    case ':': return TILE_FRAMES.plot;
    case '~': return TILE_FRAMES.water1;
    case '#': return TILE_FRAMES.fence;
    case 'b': return TILE_FRAMES.bush;
    case '_': return TILE_FRAMES.bridge;
    default: return ((tx * 7 + ty * 13) ^ (tx * ty)) % 5 === 0 ? TILE_FRAMES.grass2 : TILE_FRAMES.grass;
  }
}
