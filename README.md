# RumiNation

A cosy 2D farming game you play in the browser with friends. Create a world, send your friends its code (like `MOON-4823`), pick Ding, Chime, Jingle or Gong, and explore the farm together. Up to 8 players share a world, and it's saved on the server.

**Steps 1 and 2 of 6 are done: walking together, and farming.** You can:
- create a world or join one by code
- walk the Farm and the Market Path with your friends
- till the farm plot, plant seeds, water them, and harvest the crops as they grow each morning (they keep growing while nobody's online, if you watered them before you left)
- sell your harvest at the market stall (open 08:00–18:00) for Rumis, and buy more seeds
- watch day turn to night, and go to bed to start the next day
- jump, sit and nap

Everyone in a world shares the farm; your bag and your Rumis are your own.

Fishing, hunting, mining and blacksmithing come in the next steps. See the [design](docs/superpowers/specs/2026-11-23-ruminate-design.md) and the [item catalogue](docs/superpowers/specs/2026-11-23-ruminate-catalogue.md).

## Run it

You need Node 22 or newer.

```bash
npm install
```

```bash
npm run dev
```

This starts the game server on port 2567 and the game on port 5173. Open http://localhost:5173 and create a world.

### Play with friends

- **On the same Wi-Fi:** your friends open `http://<your computer's local IP>:5173`. `npm run dev` prints it as the "Network" address.
- **Anywhere else:** the game needs hosting. That's a later step. For a quick try, a tunnel such as `cloudflared tunnel --url http://localhost:2567` works with a built game (see below).

### Build and run as one server

```bash
npm run build
```

```bash
npm start -w server
```

The server then hosts the game itself on http://localhost:2567, on a single port, which is how it would run when hosted.

## Controls

| Key | Does |
|---|---|
| WASD or arrow keys | Walk |
| E, Space or click | Use the selected item on the tile in front of you (till, water, plant, harvest); go to bed at the house door; open the shop at the stall |
| 1–9 or mouse wheel | Pick a toolbar slot |
| Tab | Open your bag (click two slots to swap them) |
| Z / X / C | Jump / sit / nap |
| P | Players in this world (the owner can remove someone) |

## Saves

Worlds are saved in `server/data/worlds.db` (SQLite): every 30 seconds, whenever someone leaves, and when the world empties. The clock stops while nobody is in a world.

## Develop

```bash
npm test
```

```bash
npm run typecheck
```

```bash
node e2e/two-players.mjs
```

The last one starts the game, has two browsers meet in a world, and saves screenshots to `e2e/out/`.

| Folder | What's in it |
|---|---|
| `shared/` | The game rules as pure TypeScript, with tests. Rules live here and nowhere else. |
| `server/` | The Colyseus server. One room per world. The server checks every action. |
| `client/` | The Phaser 4 game and its lobby. |
| `art/` | The character sheets and the scripts that make the sprites and tiles. |
| `docs/superpowers/` | The design, the catalogue and the build plans. |
