# Art

Everything is pixel art in the style of the four character sheets: a 1 px dark plum outline (`#412234`), soft pastel fills, flat two-tone shading with plum-leaning shadows, and no anti-aliasing. The game draws it all at 3× with nearest-neighbour scaling.

| Script | Reads | Writes |
|---|---|---|
| `make_sprites.py` | `source/{ding,chime,jingle,gong}.webp`, the 4 × 2 pose sheets | `client/public/sprites/<species>-<pose>.png` (32 sprites) and `out/contact.png` |
| `make_tiles.py` | nothing (the art is drawn in code) | `client/public/tiles/tiles.png`, the props, and `out/tiles-contact.png` |

Run them from the repo root (they need `numpy` and `Pillow`):

```bash
python3 art/make_sprites.py
python3 art/make_tiles.py
```

`make_sprites.py` finds each sheet's pixel grid by itself, so a replacement sheet only needs the same 4 × 2 pose layout: front, three-quarter, side, back; walk, jump, sit, sleep. The side pose faces right; the game flips it for left.

The frame order of `tiles.png` is `TILE_FRAMES` in `make_tiles.py`, and it must match `client/src/game/tiles.ts`.
