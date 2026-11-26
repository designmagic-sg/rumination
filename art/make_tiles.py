"""Draw RumiNation's world tiles and props as pixel art that matches the characters.

House style, taken from the four character sheets:
- a dark plum outline (#412234) around every prop, 1 px, like the characters
- soft pastel fills with flat two-tone shading (a light and a shade per colour)
- shadows lean plum rather than grey or black
- no anti-aliasing: every pixel is a solid palette colour

Writes, at true pixel size (the game draws them at 3x):
  client/public/tiles/tiles.png   16 px ground tiles in a strip, frame order below
  client/public/tiles/<prop>.png  house, house-lit, shed, stall, board, sign, lamp, lamp-lit, tree, rock
and a 4x contact sheet in art/out/tiles-contact.png.

Run from the repo root:  python3 art/make_tiles.py   (needs Pillow)
"""

import random
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'client' / 'public' / 'tiles'
CONTACT = ROOT / 'art' / 'out' / 'tiles-contact.png'

# Frame order of tiles.png; client/src/game/tiles.ts must match.
TILE_FRAMES = ['grass', 'grass2', 'flowers', 'path', 'plot', 'water1', 'water2', 'fence', 'bush', 'bridge', 'soil', 'soil-wet']


def hx(s):
    s = s.lstrip('#')
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), 255)


C = {k: hx(v) for k, v in {
    'out': '#412234',
    'plum': '#8A5E6C', 'plum_l': '#AF838C',
    'grass': '#B9D193', 'grass_d': '#9FBC7F', 'grass_l': '#D2E4AE',
    'plot': '#C4D394', 'plot_d': '#A9BF7E',
    'path': '#EAD6B3', 'path_d': '#D2B993', 'path_l': '#F6E8CE',
    'water': '#A3C4E8', 'water_d': '#8AACD8', 'water_l': '#DDEBF8',
    'wood': '#C99271', 'wood_d': '#A27056', 'wood_l': '#E3B795',
    'leaf': '#94BC7C', 'leaf_d': '#76A066', 'leaf_l': '#B6D69A',
    'cream': '#FAE5D0', 'cream_d': '#E6CBB3',
    'coral': '#E47F78', 'coral_d': '#C3615F', 'coral_l': '#F2A29A',
    'lilac': '#ABA5CB', 'lilac_d': '#8B84B3', 'lilac_l': '#C9C4E2',
    'pink': '#F4AABD', 'gold': '#F2C14E', 'gold_d': '#D49A33', 'warm': '#FFD27A',
    'glass': '#BFD0EF', 'glass_d': '#9FB1DD', 'dark': '#5A3A4C',
    'soil': '#B07A5C', 'soil_d': '#8F5E47', 'soil_l': '#C9967A',
    'wet': '#7E5444', 'wet_d': '#63402F', 'wet_l': '#9A6A57',
    'stone': '#BDB4C4', 'stone_d': '#9C92A8', 'stone_l': '#D8D1DE',
    'orange': '#F09A55', 'red': '#E2665E', 'green': '#8CC06A',
}.items()}
CLEAR = (0, 0, 0, 0)


class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.px = [[CLEAR] * w for _ in range(h)]

    def set(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y][x] = c

    def get(self, x, y):
        return self.px[y][x] if 0 <= x < self.w and 0 <= y < self.h else CLEAR

    def rect(self, x, y, w, h, c):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.set(xx, yy, c)

    def hline(self, x0, x1, y, c):
        for x in range(x0, x1 + 1):
            self.set(x, y, c)

    def vline(self, x, y0, y1, c):
        for y in range(y0, y1 + 1):
            self.set(x, y, c)

    def ellipse(self, cx, cy, rx, ry, c):
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1:
                    self.set(x, y, c)

    def shade_ellipse(self, cx, cy, rx, ry, base, shade, light):
        """Flat two-tone ball: base, a shade crescent bottom-right, a light patch top-left."""
        self.ellipse(cx, cy, rx, ry, base)
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                inside = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1
                if not inside:
                    continue
                if ((x + 0.5 - cx + rx * 0.35) / rx) ** 2 + ((y + 0.5 - cy + ry * 0.35) / ry) ** 2 > 1:
                    self.set(x, y, shade)
                elif ((x + 0.5 - cx + rx * 0.3) / (rx * 0.38)) ** 2 + ((y + 0.5 - cy + ry * 0.35) / (ry * 0.3)) ** 2 <= 1:
                    self.set(x, y, light)

    def outline(self, c=C['out']):
        """1 px outline on the transparent pixels touching opaque ones (4-neighbour), like the characters."""
        add = []
        for y in range(self.h):
            for x in range(self.w):
                if self.px[y][x][3]:
                    continue
                if any(self.get(x + dx, y + dy)[3] and self.get(x + dx, y + dy) != c
                       for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    add.append((x, y))
        for x, y in add:
            self.px[y][x] = c

    def paste(self, other, ox, oy):
        for y in range(other.h):
            for x in range(other.w):
                if other.px[y][x][3]:
                    self.set(ox + x, oy + y, other.px[y][x])

    def image(self):
        im = Image.new('RGBA', (self.w, self.h))
        im.putdata([p for row in self.px for p in row])
        return im


def sprinkle(cv, n, colours, seed, margin=1):
    r = random.Random(seed)
    for _ in range(n):
        x = r.randrange(margin, cv.w - margin)
        y = r.randrange(margin, cv.h - margin)
        cv.set(x, y, r.choice(colours))


def tuft(cv, x, y, c):
    cv.set(x, y, c)
    cv.set(x - 1, y + 1, c)
    cv.set(x + 1, y + 1, c)


# ---------- ground tiles (16 x 16, no outline, tileable) ----------

def grass(seed=1):
    cv = Canvas(16, 16)
    cv.rect(0, 0, 16, 16, C['grass'])
    r = random.Random(seed)
    for _ in range(4):
        tuft(cv, r.randrange(2, 14), r.randrange(1, 14), C['grass_d'])
    for _ in range(3):
        cv.set(r.randrange(1, 15), r.randrange(1, 15), C['grass_l'])
    return cv


def flowers():
    cv = grass(5)
    for (x, y, c) in ((3, 4, C['pink']), (11, 3, C['cream']), (7, 10, C['lilac_l']), (13, 12, C['pink'])):
        cv.set(x, y, c); cv.set(x - 1, y, c); cv.set(x + 1, y, c); cv.set(x, y - 1, c); cv.set(x, y + 1, c)
        cv.set(x, y, C['gold'])
    return cv


def path():
    cv = Canvas(16, 16)
    cv.rect(0, 0, 16, 16, C['path'])
    for (x, y) in ((3, 3), (10, 6), (6, 11), (13, 13)):
        cv.set(x, y, C['path_d']); cv.set(x + 1, y, C['path_d']); cv.set(x, y - 1, C['path_l'])
    sprinkle(cv, 4, [C['path_l']], 9)
    return cv


def plot():
    """Farmable grass: a little yellower, with a faint dotted grid so you can see where to dig."""
    cv = Canvas(16, 16)
    cv.rect(0, 0, 16, 16, C['plot'])
    for y in (0, 8):
        for x in range(0, 16, 2):
            cv.set(x, y, C['plot_d'])
    for x in (0, 8):
        for y in range(0, 16, 2):
            cv.set(x, y, C['plot_d'])
    tuft(cv, 4, 4, C['plot_d'])
    tuft(cv, 12, 11, C['plot_d'])
    return cv


def water(frame):
    cv = Canvas(16, 16)
    cv.rect(0, 0, 16, 16, C['water'])
    off = 0 if frame == 0 else 3
    for (x, y) in ((2, 3), (9, 7), (4, 12), (12, 13)):
        xx = (x + off) % 14
        cv.hline(xx, xx + 2, y, C['water_d'])
        cv.set(xx + 1, y - 1, C['water_l'])
    return cv


def fence():
    cv = grass(11)
    for x in (2, 12):
        cv.rect(x, 2, 3, 12, C['wood'])
        cv.vline(x + 2, 3, 13, C['wood_d'])
        cv.hline(x, x + 2, 2, C['wood_l'])
    cv.rect(0, 5, 16, 2, C['wood'])
    cv.hline(0, 15, 6, C['wood_d'])
    cv.rect(0, 10, 16, 2, C['wood'])
    cv.hline(0, 15, 11, C['wood_d'])
    # outline the wood only, keeping the grass
    wood = {C['wood'], C['wood_d'], C['wood_l']}
    add = []
    for y in range(16):
        for x in range(16):
            if cv.px[y][x] in wood:
                continue
            if any(cv.get(x + dx, y + dy) in wood for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                add.append((x, y))
    for x, y in add:
        cv.px[y][x] = C['out']
    return cv


def bush():
    cv = grass(13)
    b = Canvas(16, 16)
    b.shade_ellipse(8, 8.5, 7, 6.5, C['leaf'], C['leaf_d'], C['leaf_l'])
    b.set(5, 6, C['pink']); b.set(10, 9, C['pink'])
    b.outline()
    cv.paste(b, 0, 0)
    return cv


def bridge():
    cv = water(0)
    for y in range(0, 16, 4):
        cv.rect(0, y, 16, 3, C['wood'])
        cv.hline(0, 15, y + 2, C['wood_d'])
        cv.set(3, y + 1, C['wood_d']); cv.set(11, y + 1, C['wood_d'])
    cv.vline(0, 0, 15, C['out']); cv.vline(15, 0, 15, C['out'])
    return cv


def soil(wet=False):
    """Tilled earth: a square bed with furrows, inset 1 px so neighbouring beds read as separate rows."""
    base, dark, light = (C['wet'], C['wet_d'], C['wet_l']) if wet else (C['soil'], C['soil_d'], C['soil_l'])
    cv = Canvas(16, 16)
    cv.rect(1, 1, 14, 14, base)
    cv.hline(1, 14, 1, light)
    cv.hline(1, 14, 14, dark)
    cv.vline(14, 1, 14, dark)
    for y in (5, 9, 12):
        cv.hline(3, 12, y, dark)
        cv.hline(3, 12, y - 1, light)
    if wet:
        cv.set(4, 3, C['water_l']); cv.set(10, 7, C['water_l']); cv.set(6, 11, C['water_l'])
    return cv


# ---------- props (outlined) ----------

def window(cv, x, y, lit):
    cv.rect(x, y, 12, 11, C['wood_d'])
    glass, glass_d = (C['warm'], C['gold']) if lit else (C['glass'], C['glass_d'])
    cv.rect(x + 1, y + 1, 10, 9, glass)
    cv.rect(x + 1, y + 6, 10, 4, glass_d)
    cv.vline(x + 6, y + 1, y + 9, C['wood_d'])
    cv.hline(x + 1, x + 10, y + 5, C['wood_d'])
    if not lit:
        cv.set(x + 2, y + 2, C['water_l']); cv.set(x + 3, y + 2, C['water_l'])
    # flower box
    cv.rect(x - 1, y + 11, 14, 3, C['wood'])
    cv.hline(x - 1, x + 12, y + 13, C['wood_d'])
    for fx in range(x, x + 12, 3):
        cv.set(fx, y + 10, C['pink']); cv.set(fx + 1, y + 10, C['leaf'])


def house(lit=False):
    cv = Canvas(96, 80)
    # walls
    cv.rect(9, 38, 78, 40, C['cream'])
    cv.rect(9, 70, 78, 8, C['cream_d'])
    for x in (9, 86):
        cv.rect(x, 38, 3, 40, C['wood'])
        cv.vline(x + 2, 38, 77, C['wood_d'])
    cv.rect(9, 38, 80, 3, C['wood'])
    cv.hline(9, 88, 40, C['wood_d'])
    # chimney (behind the roof)
    cv.rect(68, 2, 10, 16, C['stone'])
    cv.rect(68, 2, 10, 2, C['stone_l'])
    cv.vline(77, 4, 17, C['stone_d'])
    # roof: shingle rows, each a little wider going down
    for i, y in enumerate(range(8, 40, 4)):
        inset = max(0, 10 - i * 2)
        x0, x1 = 3 + inset, 92 - inset
        cv.rect(x0, y, x1 - x0 + 1, 4, C['coral'])
        cv.hline(x0, x1, y + 3, C['coral_d'])
        for sx in range(x0 + (i % 2) * 4, x1, 8):
            cv.set(sx, y + 1, C['coral_d']); cv.set(sx, y + 2, C['coral_d'])
    cv.hline(13, 82, 8, C['coral_l'])
    cv.hline(13, 82, 9, C['coral_l'])
    cv.rect(3, 38, 90, 2, C['coral_d'])
    # door, centred on the door tile (third tile across: x 32..47)
    cv.rect(33, 52, 14, 26, C['wood'])
    cv.rect(33, 52, 14, 2, C['wood_l'])
    cv.vline(39, 54, 77, C['wood_d'])
    cv.vline(46, 52, 77, C['wood_d'])
    cv.set(43, 65, C['gold']); cv.set(43, 66, C['gold_d'])
    # a little bell over the door
    cv.rect(38, 46, 4, 3, C['gold']); cv.set(39, 49, C['gold_d']); cv.set(40, 49, C['gold_d']); cv.set(39, 45, C['gold_d'])
    # windows
    window(cv, 16, 50, lit)
    window(cv, 62, 50, lit)
    # step
    cv.rect(31, 77, 18, 2, C['stone'])
    cv.outline()
    return cv


def shed():
    cv = Canvas(64, 64)
    cv.rect(6, 28, 52, 34, C['wood'])
    for x in range(6, 58, 6):
        cv.vline(x + 5, 28, 61, C['wood_d'])
    cv.rect(6, 56, 52, 6, C['wood_d'])
    # roof
    for i, y in enumerate(range(6, 28, 4)):
        inset = max(0, 8 - i * 2)
        cv.rect(2 + inset, y, 60 - 2 * inset, 4, C['lilac'])
        cv.hline(2 + inset, 61 - inset, y + 3, C['lilac_d'])
    cv.hline(10, 53, 6, C['lilac_l'])
    # chimney with forge glow
    cv.rect(46, 0, 8, 10, C['stone']); cv.rect(47, 0, 6, 2, C['dark'])
    # open door with the forge inside
    cv.rect(22, 38, 20, 24, C['dark'])
    cv.rect(26, 50, 12, 8, C['orange']); cv.rect(28, 52, 8, 4, C['warm'])
    cv.rect(22, 38, 20, 2, C['wood_d'])
    # anvil sign
    cv.rect(44, 32, 12, 9, C['cream'])
    cv.rect(46, 35, 8, 2, C['stone_d']); cv.rect(48, 37, 4, 2, C['stone_d']); cv.rect(47, 39, 6, 1, C['stone_d'])
    cv.outline()
    return cv


def stall():
    cv = Canvas(64, 48)
    # posts
    for x in (5, 55):
        cv.rect(x, 12, 4, 34, C['wood']); cv.vline(x + 3, 12, 45, C['wood_d'])
    # awning stripes with a scalloped edge
    for i, x in enumerate(range(2, 62, 6)):
        col = C['coral'] if i % 2 == 0 else C['cream']
        cv.rect(x, 2, 6, 12, col)
        cv.rect(x + 1, 14, 4, 2, col)
    cv.hline(2, 61, 2, C['coral_l'])
    # counter
    cv.rect(3, 28, 58, 18, C['wood'])
    cv.rect(3, 28, 58, 3, C['wood_l'])
    for x in range(8, 60, 10):
        cv.vline(x, 31, 45, C['wood_d'])
    # produce crates
    for (x, col, col2) in ((8, C['orange'], C['green']), (24, C['red'], C['coral_l']), (40, C['green'], C['leaf_l'])):
        cv.rect(x, 22, 14, 6, C['wood_d'])
        for px in range(x + 1, x + 13, 3):
            cv.rect(px, 20, 2, 3, col); cv.set(px, 20, col2)
    cv.outline()
    return cv


def board():
    cv = Canvas(32, 32)
    for x in (4, 25):
        cv.rect(x, 8, 3, 23, C['wood']); cv.vline(x + 2, 8, 30, C['wood_d'])
    cv.rect(2, 6, 28, 16, C['wood'])
    cv.rect(3, 7, 26, 14, C['wood_l'])
    cv.rect(1, 3, 30, 3, C['coral']); cv.hline(1, 30, 5, C['coral_d'])
    for (x, y, w, h) in ((5, 9, 7, 9), (14, 8, 6, 6), (21, 10, 6, 8), (14, 15, 6, 5)):
        cv.rect(x, y, w, h, C['cream'])
        cv.set(x + w // 2, y, C['red'])
        for ly in range(y + 2, y + h - 1, 2):
            cv.hline(x + 1, x + w - 2, ly, C['cream_d'])
    cv.outline()
    return cv


def sign():
    cv = Canvas(16, 16)
    cv.rect(7, 8, 2, 7, C['wood_d'])
    cv.rect(2, 3, 12, 6, C['wood'])
    cv.hline(2, 13, 3, C['wood_l'])
    cv.hline(2, 13, 8, C['wood_d'])
    cv.hline(4, 8, 5, C['dark']); cv.hline(4, 11, 6, C['dark'])
    cv.outline()
    return cv


def lamp(lit=False):
    cv = Canvas(16, 32)
    cv.rect(7, 12, 2, 19, C['dark'])
    cv.rect(5, 29, 6, 2, C['dark'])
    cv.rect(4, 3, 8, 9, C['dark'])
    cv.rect(5, 4, 6, 7, C['warm'] if lit else C['glass'])
    if lit:
        cv.rect(6, 6, 4, 3, (255, 244, 200, 255))
    cv.rect(3, 2, 10, 2, C['dark'])
    cv.set(7, 1, C['dark']); cv.set(8, 1, C['dark'])
    cv.outline()
    return cv


def tree():
    cv = Canvas(32, 48)
    # trunk
    cv.rect(13, 30, 7, 16, C['wood'])
    cv.vline(18, 30, 45, C['wood_d']); cv.vline(19, 30, 45, C['wood_d'])
    cv.rect(11, 44, 3, 2, C['wood']); cv.rect(19, 44, 3, 2, C['wood_d'])
    # canopy: three overlapping balls
    cv.shade_ellipse(10, 20, 9, 9, C['leaf'], C['leaf_d'], C['leaf_l'])
    cv.shade_ellipse(22, 20, 9, 9, C['leaf'], C['leaf_d'], C['leaf_l'])
    cv.shade_ellipse(16, 12, 11, 10, C['leaf'], C['leaf_d'], C['leaf_l'])
    for (x, y) in ((9, 14), (20, 9), (24, 22), (13, 24)):
        cv.set(x, y, C['leaf_d']); cv.set(x + 1, y, C['leaf_d'])
    cv.set(12, 8, C['pink']); cv.set(21, 17, C['pink'])
    cv.outline()
    return cv


def rock():
    cv = Canvas(16, 16)
    cv.shade_ellipse(8, 10, 6.5, 4.8, C['stone'], C['stone_d'], C['stone_l'])
    cv.set(9, 9, C['stone_d']); cv.set(10, 10, C['stone_d'])
    cv.outline()
    return cv


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    CONTACT.parent.mkdir(parents=True, exist_ok=True)
    frames = {'grass': grass(1), 'grass2': grass(2), 'flowers': flowers(), 'path': path(), 'plot': plot(),
              'water1': water(0), 'water2': water(1), 'fence': fence(), 'bush': bush(), 'bridge': bridge(),
              'soil': soil(), 'soil-wet': soil(True)}
    assert list(frames) == TILE_FRAMES
    strip = Canvas(16 * len(frames), 16)
    for i, name in enumerate(TILE_FRAMES):
        strip.paste(frames[name], i * 16, 0)
    strip.image().save(OUT / 'tiles.png')
    props = {'house': house(), 'house-lit': house(True), 'shed': shed(), 'stall': stall(), 'board': board(),
             'sign': sign(), 'lamp': lamp(), 'lamp-lit': lamp(True), 'tree': tree(), 'rock': rock()}
    for name, cv in props.items():
        cv.image().save(OUT / f'{name}.png')
    # Contact sheet: a little scene at 4x so the pieces can be judged together.
    s = 4
    scene = Canvas(16 * 16, 16 * 9)
    for ty in range(9):
        for tx in range(16):
            name = 'grass' if (tx * 7 + ty * 3) % 5 else 'grass2'
            if ty in (6,):
                name = 'path'
            if tx in (12, 13, 14, 15) and ty >= 7:
                name = 'water1'
            if (tx + ty) % 11 == 0 and name.startswith('grass'):
                name = 'flowers'
            scene.paste(frames[name], tx * 16, ty * 16)
    for i in range(4):
        scene.paste(frames['plot'], (1 + i) * 16, 7 * 16)
        scene.paste(frames['fence'], (8 + i % 3) * 16, 8 * 16)
    scene.paste(frames['bush'], 0, 8 * 16)
    scene.paste(frames['bridge'], 13 * 16, 8 * 16)
    scene.paste(props['house'], 8, 4)
    scene.paste(props['shed'], 112, 20)
    scene.paste(props['board'], 184, 52)
    scene.paste(props['tree'], 222, 2)
    scene.paste(props['stall'], 176, 62)
    scene.paste(props['lamp'], 100, 66)
    scene.paste(props['sign'], 120, 84)
    scene.paste(props['rock'], 140, 120)
    im = scene.image().resize((scene.w * s, scene.h * s), Image.NEAREST)
    # Put a character in for scale.
    sprite = ROOT / 'client' / 'public' / 'sprites' / 'ding-front.png'
    if sprite.exists():
        ch = Image.open(sprite).convert('RGBA')
        im.alpha_composite(ch.resize((ch.width * s, ch.height * s), Image.NEAREST), (60 * s, 64 * s))
        ch2 = Image.open(ROOT / 'client' / 'public' / 'sprites' / 'chime-side.png').convert('RGBA')
        im.alpha_composite(ch2.resize((ch2.width * s, ch2.height * s), Image.NEAREST), (150 * s, 60 * s))
    lit = props['house-lit'].image()
    sheet = Image.new('RGBA', (im.width + lit.width * s + 16, max(im.height, lit.height * s)), (40, 30, 48, 255))
    sheet.alpha_composite(im, (0, 0))
    sheet.alpha_composite(lit.resize((lit.width * s, lit.height * s), Image.NEAREST), (im.width + 16, 0))
    sheet.save(CONTACT)
    print(f'wrote tiles.png ({len(frames)} frames) and {len(props)} props')


if __name__ == '__main__':
    main()
