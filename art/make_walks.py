"""Turn the generated walk-cycle sheets into true-pixel walk frames that match each character's poses.

Reads art/source/walk-<species>.png: a 3 x 4 grid on white (rows: towards the viewer, facing right,
away; columns: the 4 frames of the cycle), generated with Higgsfield from the character's own sheet.
Each sheet is scaled so a walking frame is as tall as that character's existing front pose, then
cleaned like make_sprites.py. Writes client/public/sprites/<species>-walk-<down|side|up>-<0..3>.png
and art/out/walks-contact.png.

Run from the repo root after make_sprites.py:  python3 art/make_walks.py
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from make_sprites import cut_out, despeckle, downsample, palette, place, to_indices, to_rgba  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SPRITES = ROOT / 'client' / 'public' / 'sprites'
DIRS = ['down', 'side', 'up']
SPECIES = ['ding', 'chime', 'jingle', 'gong']


def opaque_height(path):
    a = np.asarray(Image.open(path).convert('RGBA'))
    ys = np.nonzero(a[..., 3] > 0)[0]
    return ys.max() - ys.min() + 1


def run(sp):
    src_path = ROOT / 'art' / 'source' / f'walk-{sp}.png'
    if not src_path.exists():
        return None
    src = np.asarray(Image.open(src_path).convert('RGBA'))
    h, w = src.shape[:2]
    cuts = []
    for r in range(3):
        for c in range(4):
            cuts.append(cut_out(src[int(r * h / 3): int((r + 1) * h / 3), int(c * w / 4): int((c + 1) * w / 4)]))
    # Scale: the front walking frames should be as tall as the existing front pose.
    target = opaque_height(SPRITES / f'{sp}-front.png')
    source = np.median([c.shape[0] for c in cuts[:4]])
    b = source / target
    pal = palette(cuts)
    smalls = [despeckle(downsample(to_indices(a, pal), b, len(pal)), len(pal)) for a in cuts]
    cw = max(s.shape[1] for s in smalls) + 2
    ch = max(s.shape[0] for s in smalls) + 1
    frames = []
    for i, s in enumerate(smalls):
        r, c = divmod(i, 4)
        img = place(to_rgba(s, pal), cw, ch)
        Image.fromarray(img, 'RGBA').save(SPRITES / f'{sp}-walk-{DIRS[r]}-{c}.png', optimize=True)
        frames.append(img)
    print(f'{sp}: {b:.2f}px per art pixel, front pose {target}px tall, frames ' + ' '.join(f'{s.shape[1]}x{s.shape[0]}' for s in smalls))
    return frames


def main():
    rows = [f for f in (run(sp) for sp in SPECIES) if f]
    if not rows:
        return
    cw = max(i.shape[1] for r in rows for i in r)
    ch = max(i.shape[0] for r in rows for i in r)
    s = 4
    sheet = Image.new('RGBA', ((cw + 3) * 12 * s, (ch + 3) * len(rows) * s), (185, 209, 147, 255))
    for y, r in enumerate(rows):
        for x, img in enumerate(r):
            im = Image.fromarray(img, 'RGBA').resize((img.shape[1] * s, img.shape[0] * s), Image.NEAREST)
            sheet.alpha_composite(im, (x * (cw + 3) * s + s, y * (ch + 3) * s + (ch - img.shape[0]) * s + s))
    (ROOT / 'art' / 'out').mkdir(parents=True, exist_ok=True)
    sheet.save(ROOT / 'art' / 'out' / 'walks-contact.png')


if __name__ == '__main__':
    main()
