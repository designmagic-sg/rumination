"""Turn generated grid sheets (art/source/<sheet>.png, sprites on white) into true-pixel sprites.

Uses the same clean-up as the character sprites (make_sprites.py): cut each cell out, flatten
its colours to a shared palette, find the sheet's pixel grid and take the majority colour per cell.
Writes client/public/<folder>/<row>-<column>.png and a 4x contact sheet in art/out/.

Run from the repo root:  python3 art/make_sheets.py   (needs numpy, Pillow)
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from make_sprites import cut_out, despeckle, downsample, grid_size, palette, place, to_indices, to_rgba  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent

# sheet file -> (output folder, row names, column names). Generated with Higgsfield, Ding's sheet as style reference.
SHEETS = {
    'crops': ('crops',
              ['turnip', 'carrot', 'potato', 'strawberry', 'tulip', 'sunflower'],
              ['stage0', 'stage1', 'stage2', 'ripe', 'item']),
}


def run(sheet, folder, rows, cols):
    src = np.asarray(Image.open(ROOT / 'art' / 'source' / f'{sheet}.png').convert('RGBA'))
    h, w = src.shape[:2]
    cuts = []
    for r in range(len(rows)):
        for c in range(len(cols)):
            cell = src[int(r * h / len(rows)): int((r + 1) * h / len(rows)), int(c * w / len(cols)): int((c + 1) * w / len(cols))]
            cuts.append(cut_out(cell, min_keep=0.05))
    pal = palette(cuts, k=20)
    cells = [to_indices(a, pal) for a in cuts]
    b = grid_size(cells, 4.5, 7.0)  # these sheets are drawn at about 5–6 px per art pixel
    smalls = [despeckle(downsample(c, b, len(pal)), len(pal)) for c in cells]
    cw = max(s.shape[1] for s in smalls)
    ch = max(s.shape[0] for s in smalls)
    out = ROOT / 'client' / 'public' / folder
    out.mkdir(parents=True, exist_ok=True)
    imgs = []
    for i, s in enumerate(smalls):
        r, c = divmod(i, len(cols))
        img = place(to_rgba(s, pal), cw, ch)
        Image.fromarray(img, 'RGBA').save(out / f'{rows[r]}-{cols[c]}.png', optimize=True)
        imgs.append(img)
    scale = 4
    contact = Image.new('RGBA', ((cw + 3) * len(cols) * scale, (ch + 3) * len(rows) * scale), (185, 209, 147, 255))
    for i, img in enumerate(imgs):
        r, c = divmod(i, len(cols))
        im = Image.fromarray(img, 'RGBA').resize((cw * scale, ch * scale), Image.NEAREST)
        contact.alpha_composite(im, (c * (cw + 3) * scale + scale, r * (ch + 3) * scale + scale))
    (ROOT / 'art' / 'out').mkdir(parents=True, exist_ok=True)
    contact.save(ROOT / 'art' / 'out' / f'{sheet}-contact.png')
    print(f'{sheet}: art pixel {b:.2f}px, {len(pal)} colours, {len(imgs)} sprites at {cw}x{ch}')


if __name__ == '__main__':
    for sheet, (folder, rows, cols) in SHEETS.items():
        run(sheet, folder, rows, cols)
