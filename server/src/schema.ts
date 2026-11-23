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

export const WorldState = schema(
  {
    name: t.string(),
    code: t.string(),
    day: t.number().default(1),
    minute: t.number().default(360),
    /** Keyed by sessionId. */
    players: t.map(PlayerState),
  },
  'WorldState',
);
export type WorldState = SchemaType<typeof WorldState>;
