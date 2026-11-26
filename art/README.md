# Art

Everything is pixel art in the style of the four character sheets: a 1 px dark plum outline (`#412234`), soft pastel fills, flat two-tone shading with plum-leaning shadows, and no anti-aliasing. The game draws it all at 3× with nearest-neighbour scaling.

| Script | Reads | Writes |
|---|---|---|
| `make_sprites.py` | `source/{ding,chime,jingle,gong}.webp`, the 4 × 2 pose sheets | `client/public/sprites/<species>-<pose>.png` (32 sprites) and `out/contact.png` |
| `make_sheets.py` | generated grid sheets in `source/` (e.g. `crops.png`, made with Higgsfield using Ding's sheet and the tiles as style references) | `client/public/<folder>/<row>-<column>.png` and `out/<sheet>-contact.png` |
| `make_walks.py` | `source/walk-<species>.png`, 3 × 4 walk-cycle sheets generated with Higgsfield from each character's own sheet | `client/public/sprites/<species>-walk-<down\|side\|up>-<0..3>.png`, scaled to match each character's poses, and `out/walks-contact.png` |
| `make_tiles.py` | nothing (the art is drawn in code) | `client/public/tiles/tiles.png`, the props, and `out/tiles-contact.png` |

Run them from the repo root (they need `numpy` and `Pillow`):

```bash
python3 art/make_sprites.py
python3 art/make_tiles.py
```

`make_sprites.py` finds each sheet's pixel grid by itself, so a replacement sheet only needs the same 4 × 2 pose layout: front, three-quarter, side, back; walk, jump, sit, sleep. The side pose faces right; the game flips it for left.

The frame order of `tiles.png` is `TILE_FRAMES` in `make_tiles.py`, and it must match `client/src/game/tiles.ts`.

## Generated sheets

Some art is generated with Higgsfield (GPT Image 2.6), with Ding's sheet and the tiles scene as style references, then cleaned into true pixels by `make_sheets.py`. To add a sheet: ask for a plain white background and an even grid with no labels, save it to `source/<name>.png`, add an entry to `SHEETS` with its row and column names, and run the script. Look at the contact sheet before using the sprites.

| Sheet | Rows | Columns |
|---|---|---|
| `crops.png` | turnip, carrot, potato, strawberry, tulip, sunflower | stage0, stage1, stage2, ripe, item |
| `items.png` | hoe, can, seed bags (turnip, carrot) | seed bags (potato, strawberry, tulip, sunflower) |
