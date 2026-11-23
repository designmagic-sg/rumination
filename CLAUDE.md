# RumiNation: notes for Claude Code

RumiNation is a cosy 2D farming game for friends, played in the browser in shared worlds that you join with a code (e.g. `MOON-4821`). You play as Ding, Chime, Jingle or Gong, the four pixel characters borrowed from BellPals. Otherwise it has nothing to do with the BellPals app.

## Read before working
- `docs/superpowers/specs/2026-11-23-ruminate-design.md`: the design, including the decisions log in §9.
- `docs/superpowers/specs/2026-11-23-ruminate-catalogue.md`: the 117 crafting items and 25 craftables.
- `docs/superpowers/plans/`: the build plans, one per step.

## Layout
- `shared/`: game rules as pure TypeScript, with Vitest tests. Rules live here and nowhere else.
- `server/`: the Colyseus server. One room per world. The server is the referee.
- `client/`: the Phaser 4 game, built with Vite.
- `art/`: source art and the Python scripts that make the sprites and tiles.

## Commands
- `npm install`
- `npm test`: tests for `shared` and `server`
- `npm run typecheck`
- `npm run dev`: the server on :2567 and the client on :5173
- `npm run build`

## Working agreements
- Prose in docs uses British spelling. Code identifiers use American spelling.
- Never trust the client: every action is checked on the server against `shared/`.
- Keep it cute: no gore, and no prey that looks like the player characters.
