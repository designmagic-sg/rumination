import { schema, t, type SchemaType } from '@colyseus/schema';

/** What every client sees about a player. The secret player key is never in here. */
export const PlayerState = schema(
  {
    nickname: t.string(),
    species: t.string(),
    zone: t.string(),
    x: t.number(),
    y: t.number(),
    facing: t.string().default('down'),
    moving: t.boolean(),
    emote: t.string().default(''),
    inBed: t.boolean(),
    isOwner: t.boolean(),
  },
  'PlayerState',
);
export type PlayerState = SchemaType<typeof PlayerState>;

/** One tilled tile, as everyone sees it. `crop` is '' when nothing is planted; `stage` 3 means ripe. */
export const SoilState = schema(
  {
    watered: t.boolean(),
    crop: t.string().default(''),
    stage: t.number(),
  },
  'SoilState',
);
export type SoilState = SchemaType<typeof SoilState>;

export const WorldState = schema(
  {
    name: t.string(),
    code: t.string(),
    day: t.number().default(1),
    minute: t.number().default(360),
    /** Keyed by sessionId. */
    players: t.map(PlayerState),
    /** Tilled farm tiles, keyed "x,y". */
    soil: t.map(SoilState),
  },
  'WorldState',
);
export type WorldState = SchemaType<typeof WorldState>;
