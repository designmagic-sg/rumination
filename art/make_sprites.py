"""Turn the four BellPal pose sheets into RumiNation's character sprites.

Reads art/source/<species>.webp: each is a 4 x 2 sheet of poses
(front, threeq, side, back / walk, jump, sit, sleep).
Writes client/public/sprites/<species>-<pose>.png at true pixel size:
one art pixel of the sheet becomes one image pixel, and the game draws
them at 3x with nearest-neighbour scaling.

How: cut each pose out, flatten its colours to a small shared palette
(generated pixel art is noisy), find the sheet's pixel grid from where
colours change, then take the majority colour of every grid cell.
Poses are bottom-aligned on one canvas size per species so they don't
jump when the animation switches.

Based on prototype/scripts/make_sprites.py from the BellPals repo.
Run from the repo root:  python3 art/make_sprites.py   (needs numpy, Pillow)
"""

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art' / 'source'
OUT = ROOT / 'client' / 'public' / 'sprites'
CONTACT = ROOT / 'art' / 'out' / 'contact.png'
SPECIES = ['ding', 'chime', 'jingle', 'gong']
POSES = ['front', 'threeq', 'side', 'back', 'walk', 'jump', 'sit', 'sleep']
rng = np.random.default_rng(7)


# ---------- cut-out ----------

def components(mask):
    h, w = mask.shape
    lab = np.zeros((h, w), np.int32)
    sizes = {}
    n = 0
    for y0, x0 in zip(*np.nonzero(mask)):
        if lab[y0, x0]:
            continue
        n += 1
        q = deque([(y0, x0)])
        lab[y0, x0] = n
        count = 0
        while q:
            y, x = q.popleft()
            count += 1
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
                yy, xx = y + dy, x + dx
                if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = n
                    q.append((yy, xx))
        sizes[n] = count
    return lab, sizes


def cut_out(a, min_keep=0.2):
    """Make the white background transparent, drop loose bits (like the "zz"), then crop."""
    a = a.copy()
    rgb = a[..., :3].astype(int)
    # The sheets are on white: treat near-white with low saturation as background.
    whiteish = (rgb.min(-1) > 236) & (rgb.max(-1) - rgb.min(-1) < 14)
    a[whiteish, 3] = 0
    a[a[..., 3] < 24, 3] = 0
    # Background can only be reached from the edges; re-fill enclosed white (eye glints) as opaque.
    bg = flood_from_edges(a[..., 3] == 0)
    a[..., 3] = np.where(bg, 0, 255)
    lab, sizes = components(a[..., 3] > 0)
    biggest = max(sizes.values())
    keep = [k for k, v in sizes.items() if v >= biggest * min_keep]
    a[~np.isin(lab, keep), 3] = 0
    ys, xs = np.nonzero(a[..., 3] > 0)
    return a[ys.min(): ys.max() + 1, xs.min(): xs.max() + 1]


def flood_from_edges(empty):
    h, w = empty.shape
    seen = np.zeros_like(empty)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if empty[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if empty[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            yy, xx = y + dy, x + dx
            if 0 <= yy < h and 0 <= xx < w and empty[yy, xx] and not seen[yy, xx]:
                seen[yy, xx] = True
                q.append((yy, xx))
    return seen


# ---------- palette ----------

def to_lab(rgb):
    c = rgb / 255.0
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[:, 1] - 16, 500 * (f[:, 0] - f[:, 1]), 200 * (f[:, 1] - f[:, 2])], 1)


def palette(images, k=18, merge_de=7.0):
    """Cluster colours in Lab. Farthest-point seeding keeps small accents (bells, stars)."""
    px = np.concatenate([im[..., :3][im[..., 3] > 128] for im in images], 0).astype(np.float64)
    sub = px[rng.choice(len(px), size=min(len(px), 60000), replace=False)]
    lab = to_lab(sub)
    centres = [lab[rng.integers(len(lab))]]
    d2 = ((lab - centres[0]) ** 2).sum(1)
    for _ in range(1, k):
        i = int(d2.argmax())
        centres.append(lab[i])
        d2 = np.minimum(d2, ((lab - lab[i]) ** 2).sum(1))
    centres = np.array(centres)
    for _ in range(25):
        member = ((lab[:, None, :] - centres[None]) ** 2).sum(-1).argmin(1)
        for j in range(k):
            if (member == j).any():
                centres[j] = lab[member == j].mean(0)
    pal, count, cl = [], [], []
    for j in range(k):
        m = member == j
        if m.sum() >= 30:
            pal.append(sub[m].mean(0))
            count.append(m.sum())
            cl.append(centres[j])
    pal, count, cl = np.array(pal), np.array(count, float), np.array(cl)
    while True:  # merge near-identical shades into the more common one
        d = np.sqrt(((cl[:, None] - cl[None]) ** 2).sum(-1))
        np.fill_diagonal(d, 1e9)
        i, j = np.unravel_index(d.argmin(), d.shape)
        if d[i, j] >= merge_de:
            break
        if count[i] < count[j]:
            i, j = j, i
        keep = np.ones(len(pal), bool)
        keep[j] = False
        count[i] += count[j]
        pal, count, cl = pal[keep], count[keep], cl[keep]
    return pal.round().astype(np.int32)


def to_indices(a, pal):
    """Palette index per pixel; transparent = len(pal). A mode filter removes speckle."""
    labp = to_lab(pal.astype(np.float64))
    rgb = a[..., :3].reshape(-1, 3).astype(np.float64)
    idx = ((to_lab(rgb)[:, None, :] - labp[None]) ** 2).sum(-1).argmin(1).reshape(a.shape[:2])
    idx = np.where(a[..., 3] >= 128, idx, len(pal)).astype(np.uint8)
    return np.asarray(Image.fromarray(idx, 'L').filter(ImageFilter.ModeFilter(5))).astype(np.int32)


# ---------- pixel grid ----------

def change_profile(idx, axis):
    """How often the colour changes at each column (axis=1) or row (axis=0)."""
    if axis == 1:
        return (idx[:, 1:] != idx[:, :-1]).sum(0).astype(float)
    return (idx[1:, :] != idx[:-1, :]).sum(1).astype(float)


def fit_grid(profile, sizes):
    """Best (size, phase) so grid lines land where colours change."""
    n = len(profile)
    padded = np.concatenate([[0], profile, [0]])
    near = np.maximum(np.maximum(padded[:-2], padded[1:-1]), padded[2:])  # tolerate ±1 px
    best = (-1.0, 0.0, 0.0)
    for b in sizes:
        for phase in np.arange(0, b, 0.25):
            lines = np.round(np.arange(phase, n, b)).astype(int) - 1
            lines = lines[(lines >= 0) & (lines < n)]
            if not len(lines):
                continue
            score = near[lines].sum() / len(lines)
            if score > best[0]:
                best = (score, b, phase)
    return best[1], best[2]


def grid_size(cells, lo=9.0, hi=13.0):
    """One art-pixel size per sheet, fitted on all of its poses together, searched between lo and hi px."""
    sizes = np.arange(lo, hi + 0.01, 0.05)
    scores = np.zeros(len(sizes))
    for idx in cells:
        for axis in (0, 1):
            prof = change_profile(idx, axis)
            padded = np.concatenate([[0], prof, [0]])
            near = np.maximum(np.maximum(padded[:-2], padded[1:-1]), padded[2:])
            for i, b in enumerate(sizes):
                best = 0.0
                for phase in np.arange(0, b, 0.5):
                    lines = np.round(np.arange(phase, len(prof), b)).astype(int) - 1
                    lines = lines[(lines >= 0) & (lines < len(prof))]
                    if len(lines):
                        best = max(best, near[lines].sum() / len(lines))
                scores[i] += best
    return float(sizes[scores.argmax()])


def downsample(idx, b, t):
    """Majority colour of each grid cell, ignoring a 1 px margin where edges blur."""
    px = fit_grid(change_profile(idx, 1), [b])[1]
    py = fit_grid(change_profile(idx, 0), [b])[1]
    xs = np.round(np.arange(px - b, idx.shape[1] + b, b)).astype(int)
    ys = np.round(np.arange(py - b, idx.shape[0] + b, b)).astype(int)
    out = np.full((len(ys) - 1, len(xs) - 1), t, np.int32)
    for j in range(len(ys) - 1):
        y0, y1 = max(ys[j], 0), min(ys[j + 1], idx.shape[0])
        if y1 - y0 < 2:
            continue
        for i in range(len(xs) - 1):
            x0, x1 = max(xs[i], 0), min(xs[i + 1], idx.shape[1])
            if x1 - x0 < 2:
                continue
            m = 1 if (x1 - x0 > 4 and y1 - y0 > 4) else 0
            cell = idx[y0 + m: y1 - m, x0 + m: x1 - m].ravel()
            counts = np.bincount(cell, minlength=t + 1)
            # A cell is opaque if at least 40% of it is; then take its main colour.
            if counts[t] > 0.6 * cell.size:
                continue
            counts[t] = 0
            out[j, i] = counts.argmax()
    ys_, xs_ = np.nonzero(out != t)
    return out[ys_.min(): ys_.max() + 1, xs_.min(): xs_.max() + 1]


def despeckle(out, t):
    """Remove lone opaque pixels with no opaque neighbours."""
    h, w = out.shape
    res = out.copy()
    for y in range(h):
        for x in range(w):
            if out[y, x] == t:
                continue
            n = 0
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                yy, xx = y + dy, x + dx
                if 0 <= yy < h and 0 <= xx < w and out[yy, xx] != t:
                    n += 1
            if n == 0:
                res[y, x] = t
    return res


# ---------- output ----------

def to_rgba(idx, pal):
    t = len(pal)
    rgba = np.zeros(idx.shape + (4,), np.uint8)
    opaque = idx != t
    rgba[opaque, :3] = pal[idx[opaque]]
    rgba[opaque, 3] = 255
    return rgba


def place(img, w, h):
    """Bottom-align and centre a sprite on a w x h canvas."""
    canvas = np.zeros((h, w, 4), np.uint8)
    ih, iw = img.shape[:2]
    x0 = (w - iw) // 2
    canvas[h - ih:, x0: x0 + iw] = img
    return canvas


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    CONTACT.parent.mkdir(parents=True, exist_ok=True)
    rows = []
    written = 0
    for sp in SPECIES:
        sheet = np.asarray(Image.open(SRC / f'{sp}.webp').convert('RGBA'))
        h, w = sheet.shape[:2]
        cuts = []
        for i in range(8):
            r, c = divmod(i, 4)
            cell = sheet[int(r * h / 2): int((r + 1) * h / 2), int(c * w / 4): int((c + 1) * w / 4)]
            cuts.append(cut_out(cell))
        pal = palette(cuts)
        cells = [to_indices(a, pal) for a in cuts]
        b = grid_size(cells)
        smalls = [despeckle(downsample(c, b, len(pal)), len(pal)) for c in cells]
        cw = max(s.shape[1] for s in smalls) + 2
        ch = max(s.shape[0] for s in smalls) + 1
        imgs = []
        for pose, s in zip(POSES, smalls):
            img = place(to_rgba(s, pal), cw, ch)
            Image.fromarray(img, 'RGBA').save(OUT / f'{sp}-{pose}.png', optimize=True)
            imgs.append(img)
            written += 1
        rows.append(imgs)
        print(f'{sp}: art pixel {b:.2f}px, {len(pal)} colours, canvas {cw}x{ch}, poses ' +
              ' '.join(f'{s.shape[1]}x{s.shape[0]}' for s in smalls))
    # Contact sheet: every sprite at 4x on a light ground.
    cw = max(i.shape[1] for r in rows for i in r)
    ch = max(i.shape[0] for r in rows for i in r)
    s = 4
    sheet = Image.new('RGBA', ((cw + 4) * 8 * s, (ch + 4) * len(rows) * s), (236, 242, 226, 255))
    for y, r in enumerate(rows):
        for x, img in enumerate(r):
            im = Image.fromarray(img, 'RGBA').resize((img.shape[1] * s, img.shape[0] * s), Image.NEAREST)
            sheet.alpha_composite(im, (x * (cw + 4) * s + 2 * s, y * (ch + 4) * s + 2 * s))
    sheet.save(CONTACT)
    print(f'wrote {written} sprites')


if __name__ == '__main__':
    main()
