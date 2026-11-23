/**
 * The clock and the Rumi coin, drawn pixel by pixel in the characters' style:
 * a 1 px dark plum outline, flat two-tone fills, no anti-aliasing.
 * Pure functions that call `put(x, y, colour)`, so the game and the preview page share them.
 */

export type Put = (x: number, y: number, colour: string) => void;

export const CLOCK_SIZE = 52;
export const COIN_SIZE = 16;

const P = {
  out: '#412234',
  stone: '#6B4A5C',
  stoneL: '#8A5E6C',
  stoneD: '#55394A',
  gold: '#F2C14E',
  goldD: '#D49A33',
  goldL: '#FFE08A',
  sun: '#F8D46B',
  moon: '#F3EBD6',
  star: '#FFF6D8',
  hill: '#94BC7C',
  hillD: '#76A062',
  roof: '#E47F78',
  wall: '#FAE5D0',
  warm: '#FFD27A',
  coin: '#93A898',
  coinL: '#B4C6B8',
  coinD: '#6F8678',
};

/** Sky colour through the day, minute of day → colour. Stepped, not blended, like a palette swap. */
const SKY: [number, string][] = [
  [0, '#2A2A5A'],
  [300, '#4A3F78'],
  [345, '#E8A9A0'],
  [390, '#F3C77A'],
  [450, '#A3C4E8'],
  [1050, '#F3C77A'],
  [1110, '#E58A6E'],
  [1170, '#4A3F78'],
  [1200, '#2A2A5A'],
];

export function skyColour(minute: number): string {
  const m = ((minute % 1440) + 1440) % 1440;
  let c = SKY[0]![1];
  for (const [at, colour] of SKY) if (m >= at) c = colour;
  return c;
}

function isNight(minute: number): boolean {
  const m = ((minute % 1440) + 1440) % 1440;
  return m >= 1170 || m < 345;
}

/** Fill a pixel disc of radius r centred on (cx, cy), where centres sit on half pixels. */
function disc(put: Put, cx: number, cy: number, r: number, colour: string, inside?: (x: number, y: number) => boolean) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r * r && (!inside || inside(x, y))) put(x, y, colour);
    }
  }
}

/** A ring between radii r0 and r1. */
function ring(put: Put, cx: number, cy: number, r0: number, r1: number, colour: (x: number, y: number) => string) {
  for (let y = Math.floor(cy - r1); y <= Math.ceil(cy + r1); y++) {
    for (let x = Math.floor(cx - r1); x <= Math.ceil(cx + r1); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d <= r1 && d > r0) put(x, y, colour(x, y));
    }
  }
}

/** Angle clockwise from straight up: noon = 0, midnight = π. */
const angleFor = (minute: number) => ((minute - 720) / 1440) * Math.PI * 2;

/**
 * The day clock, 52 × 52 px. Noon is at the top and midnight at the bottom; the sun and moon ride
 * opposite each other around the sky and set behind the hills.
 */
export function drawClock(minute: number, put: Put) {
  const c = CLOCK_SIZE / 2; // 26: centre between pixels 25 and 26
  const sky = skyColour(minute);
  const night = isNight(minute);
  const inSky = (x: number, y: number) => Math.hypot(x + 0.5 - c, y + 0.5 - c) <= 15.5;

  // Golden crown arcs above the ring: three short arcs, a nod to old engraved dials.
  ring(put, c, c, 24.4, 25.4, () => P.goldD);
  for (let y = 0; y < CLOCK_SIZE; y++) {
    for (let x = 0; x < CLOCK_SIZE; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      if (d <= 24.4 || d > 25.4) continue;
      const deg = (Math.atan2(x + 0.5 - c, -(y + 0.5 - c)) * 180) / Math.PI;
      const keep = Math.abs(deg) <= 12 || (Math.abs(deg) >= 22 && Math.abs(deg) <= 40);
      if (!keep) put(x, y, 'transparent');
    }
  }

  // Outline, stone ring with a lit upper-left and a shaded lower-right, inner gold band, inner outline.
  ring(put, c, c, 22.5, 23.6, () => P.out);
  ring(put, c, c, 18.5, 22.5, (x, y) => {
    const lit = x + y < CLOCK_SIZE - 6;
    const shade = x + y > CLOCK_SIZE + 8;
    return lit ? P.stoneL : shade ? P.stoneD : P.stone;
  });
  ring(put, c, c, 17.4, 18.5, (x, y) => (x + y < CLOCK_SIZE ? P.gold : P.goldD));
  ring(put, c, c, 16.4, 17.4, () => P.out);

  // Hour marks on the stone: gold pips every 2 hours, bigger gems at 6, 12, 18 and 24.
  for (let h = 0; h < 24; h += 2) {
    const t = (h / 24) * Math.PI * 2;
    const x = Math.floor(c + 20.5 * Math.sin(t));
    const y = Math.floor(c - 20.5 * Math.cos(t));
    if (h % 6 === 0) {
      put(x, y, P.goldL);
      put(x - 1, y, P.gold);
      put(x + 1, y, P.gold);
      put(x, y - 1, P.gold);
      put(x, y + 1, P.goldD);
    } else {
      put(x, y, P.gold);
    }
  }

  // Sky.
  disc(put, c, c, 16.4, sky);

  // Stars at night.
  if (night) {
    for (const [x, y] of [[18, 16], [23, 13], [31, 15], [35, 21], [27, 19], [15, 23], [37, 26], [21, 22]] as const) put(x, y, P.star);
  }

  // Sun and moon on opposite ends of the arm, 11 px out.
  const a = angleFor(minute);
  const body = (ang: number) => ({ x: c + 11 * Math.sin(ang), y: c - 11 * Math.cos(ang) });
  const sun = body(a);
  const moon = body(a + Math.PI);
  disc(put, sun.x, sun.y, 3.6, P.out, inSky);
  disc(put, sun.x, sun.y, 2.7, P.sun, inSky);
  put(Math.floor(sun.x - 1), Math.floor(sun.y - 1), P.goldL);
  disc(put, moon.x, moon.y, 3.4, P.out, inSky);
  disc(put, moon.x, moon.y, 2.6, P.moon, inSky);
  disc(put, moon.x + 1.6, moon.y - 1.2, 2.2, sky, (x, y) => inSky(x, y) && Math.hypot(x + 0.5 - moon.x, y + 0.5 - moon.y) <= 2.6);

  // Hills over the lower sky, then the little house.
  const hillTop = (x: number) => 31 + Math.round(1.6 * Math.sin((x - 10) / 4.2));
  const hillTop2 = (x: number) => 35 + Math.round(1.2 * Math.sin((x + 6) / 3.3));
  for (let x = 8; x < 44; x++) {
    for (let y = hillTop(x); y < 44; y++) if (inSky(x, y)) put(x, y, P.hillD);
    if (inSky(x, hillTop(x) - 1)) put(x, hillTop(x) - 1, P.out);
    for (let y = hillTop2(x); y < 44; y++) if (inSky(x, y)) put(x, y, P.hill);
  }
  // House: roof, wall, window (lit at night).
  const hx = 23, hy = 31;
  for (let i = 0; i < 4; i++) for (let x = hx + 1 - i; x <= hx + 2 + i; x++) put(x, hy - 4 + i, i === 0 ? P.out : P.roof);
  for (let y = hy; y < hy + 3; y++) for (let x = hx - 2; x <= hx + 5; x++) put(x, y, P.wall);
  put(hx - 3, hy - 1, P.out);
  put(hx + 6, hy - 1, P.out);
  put(hx + 1, hy + 1, night ? P.warm : P.stoneL);
  put(hx + 2, hy + 1, night ? P.warm : P.stoneL);
}

/** The Rumi: a grey-green stone coin with a square hole and four carved marks, 16 × 16 px. */
export function drawCoin(put: Put) {
  const c = COIN_SIZE / 2;
  disc(put, c, c, 7.6, P.out);
  disc(put, c, c, 6.6, P.coin);
  // Lit upper-left rim, shaded lower-right rim.
  disc(put, c, c, 6.6, P.coinL, (x, y) => x + y <= 9 && Math.hypot(x + 0.5 - c, y + 0.5 - c) > 4.8);
  disc(put, c, c, 6.6, P.coinD, (x, y) => x + y >= 21 && Math.hypot(x + 0.5 - c, y + 0.5 - c) > 4.8);
  // Square hole: shaded on its top and left inner edge, lit on its bottom and right, like a carved recess.
  for (let i = 5; i <= 10; i++) {
    put(i, 5, P.coinD);
    put(5, i, P.coinD);
    put(i, 10, P.coinL);
    put(10, i, P.coinL);
  }
  for (let y = 6; y <= 9; y++) for (let x = 6; x <= 9; x++) put(x, y, 'transparent');
  // Four carved marks around the hole: top, right, bottom, left.
  for (const [x, y] of [[7, 3], [8, 3], [12, 7], [12, 8], [7, 12], [8, 12], [3, 7], [3, 8]] as const) {
    put(x, y, P.coinD);
  }
}

/** Draw into a canvas 2D context at 1 px per pixel. */
export function canvasPut(ctx: CanvasRenderingContext2D): Put {
  return (x, y, colour) => {
    if (colour === 'transparent') ctx.clearRect(x, y, 1, 1);
    else {
      ctx.fillStyle = colour;
      ctx.fillRect(x, y, 1, 1);
    }
  };
}
