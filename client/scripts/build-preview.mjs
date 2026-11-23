// Builds client/clock-preview.html: a standalone page showing the pixel clock and the Rumi coin,
// using the same drawing code as the game (src/hud/pixelArt.ts, with its types stripped).
// Run from the repo root: node client/scripts/build-preview.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../src/hud/pixelArt.ts'), 'utf8');
const js = stripTypeScriptTypes(src, { mode: 'strip' }).replace(/^export /gm, '');

const page = `<title>RumiNation Clock and Coin</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;600;700&family=VT323&display=swap">
<style>
/* Layout: a night-meadow page; every clock sits on a patch of the game's own grass so it's judged where it lives. */
:root {
  --ink: #1A1420; --panel: #241C2C; --line: #3A2E44; --text: #EFE6DA; --muted: #B3A6B8; --gold: #F2C14E;
  --grass: #B9D193; --grass-d: #9FBC7F;
  --font: "Pixelify Sans", "Courier New", monospace; --code: "VT323", "Courier New", monospace;
  color-scheme: dark;
}
html { background: var(--ink); }
body { background: var(--ink); color: var(--text); font-family: var(--font); font-variant-ligatures: none; font-size: 17px; line-height: 1.5; }
.wrap { max-width: 1040px; margin: 0 auto; padding-block: 32px 56px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); display: grid; gap: 36px; }
h1 { margin: 0; font-size: clamp(34px, 6vw, 52px); color: var(--gold); text-shadow: 0 4px 0 #412234; }
h2 { margin: 0; font-size: 22px; font-weight: 600; text-wrap: balance; }
p { margin: 0; max-width: 66ch; color: var(--muted); }
section { display: grid; gap: 16px; }
.meadow { background-color: var(--grass); border: 3px solid #412234; box-shadow: 0 4px 0 #412234; position: relative; overflow: hidden; image-rendering: pixelated; background-size: 48px 48px; }
.tint { position: absolute; inset: 0; background: #1B1F4A; pointer-events: none; }
.hero { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 20px; }
@media (max-width: 720px) { .hero { grid-template-columns: minmax(0, 1fr); } }
.hero .meadow { min-height: 300px; display: flex; justify-content: flex-end; align-items: flex-start; padding: 16px; }
.clock { position: relative; z-index: 1; display: grid; justify-items: center; gap: 6px; }
canvas { image-rendering: pixelated; display: block; }
.plaque { font-family: var(--code); font-size: 24px; line-height: 1; color: #f4e4be; background: #2a2230; border: 3px solid var(--gold); box-shadow: 0 3px 0 #412234; padding: 2px 10px 3px; white-space: nowrap; }
.big { display: grid; place-items: center; background: var(--panel); border: 1px solid var(--line); padding: 18px; gap: 10px; }
.big figcaption { color: var(--muted); font-size: 15px; }
.controls { display: flex; flex-wrap: wrap; gap: 12px 18px; align-items: center; background: var(--panel); border: 1px solid var(--line); padding: 14px 16px; }
.controls label { color: var(--muted); }
#time { flex: 1 1 240px; min-width: 0; accent-color: var(--gold); }
.readout { font-family: var(--code); font-size: 26px; color: var(--gold); min-width: 5ch; }
button { font-family: var(--font); font-size: 17px; font-weight: 700; color: #412234; background: var(--gold); border: 3px solid #412234; box-shadow: 0 3px 0 #000; padding: 6px 14px; cursor: pointer; }
button:active { transform: translateY(2px); box-shadow: 0 1px 0 #000; }
button:focus-visible, input:focus-visible { outline: 3px solid #fff; outline-offset: 2px; }
.strip { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
@media (max-width: 720px) { .strip { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.strip .meadow { padding: 12px 4px; display: grid; justify-items: center; }
.coins { display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-end; background: var(--panel); border: 1px solid var(--line); padding: 20px; }
.coins figure { margin: 0; display: grid; justify-items: center; gap: 8px; }
.coins figcaption { font-size: 14px; color: var(--muted); }
.purse { display: inline-flex; align-items: center; gap: 8px; font-family: var(--code); font-size: 26px; line-height: 1; color: #f4e4be; background: #2a2230; border: 3px solid var(--gold); padding: 4px 12px 4px 8px; }
ul { margin: 0; padding-left: 22px; color: var(--muted); max-width: 70ch; }
</style>

<div class="wrap">
  <header style="display:grid;gap:10px">
    <h1>RumiNation</h1>
    <h2>The day clock and the Rumi, as pixel art</h2>
    <p>Redrawn pixel by pixel to match your characters: the same dark plum outline, flat two-tone colours and no smoothing. Noon is at the top and midnight at the bottom. The sun rises over the hills at 06:00 and sets at 18:00, then the moon, the stars and the little house's window come out. Drag the slider or play a day in 24 seconds.</p>
  </header>

  <section aria-labelledby="h1">
    <h2 id="h1">In the game</h2>
    <div class="hero">
      <div class="meadow" id="m1"><div class="tint" id="tint"></div><div class="clock"><canvas id="c-game"></canvas><div class="plaque" id="plaque"></div></div></div>
      <figure class="big" style="margin:0"><canvas id="c-big"></canvas><figcaption>Close up, at 6×</figcaption></figure>
    </div>
    <div class="controls">
      <label for="time">Time</label>
      <input id="time" type="range" min="360" max="1560" step="1" value="1110">
      <span class="readout" id="readout"></span>
      <button id="play" type="button">Play a day</button>
    </div>
  </section>

  <section aria-labelledby="h2">
    <h2 id="h2">Through one day</h2>
    <div class="strip" id="strip"></div>
  </section>

  <section aria-labelledby="h3">
    <h2 id="h3">The Rumi</h2>
    <p>A 16 × 16 grey-green stone coin with a square hole, like an old Chinese coin. Four small carved marks sit around the hole instead of real characters.</p>
    <div class="coins" id="coins"></div>
  </section>

  <section aria-labelledby="h4">
    <h2 id="h4">What to tell me</h2>
    <ul>
      <li>Is the clock right, or should anything change: colours, size, more or less gold, the hills and house?</li>
      <li>The coin: keep the four abstract marks, or try real characters such as 通寶 ("circulating treasure", common on old coins)? Real characters would need a bigger coin, around 24 px, to stay readable.</li>
    </ul>
  </section>
</div>

<script>
${js}
(() => {
  const DUSK = 1080, NIGHT = 1200;
  const light = m => (m < DUSK ? 0 : m < NIGHT ? (m - DUSK) / (NIGHT - DUSK) : 1);
  const fmt = m => { const t = Math.floor(m) % 1440; return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
  function paint(canvas, size, scale, draw) {
    canvas.width = size; canvas.height = size;
    canvas.style.width = size * scale + 'px'; canvas.style.height = size * scale + 'px';
    const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, size, size); draw(canvasPut(ctx));
  }
  // The game's own grass tile as the meadow background.
  (function grass() {
    const c = document.createElement('canvas'); c.width = 16; c.height = 16; const x = c.getContext('2d');
    x.fillStyle = '#B9D193'; x.fillRect(0, 0, 16, 16); x.fillStyle = '#9FBC7F';
    for (const [a, b] of [[4, 3], [11, 8], [6, 12], [13, 13]]) { x.fillRect(a, b, 1, 1); x.fillRect(a - 1, b + 1, 1, 1); x.fillRect(a + 1, b + 1, 1, 1); }
    x.fillStyle = '#D2E4AE'; x.fillRect(2, 9, 1, 1); x.fillRect(9, 2, 1, 1);
    const url = 'url(' + c.toDataURL() + ')';
    document.querySelectorAll('.meadow').forEach(m => (m.style.backgroundImage = url));
  })();
  const game = document.getElementById('c-game'), big = document.getElementById('c-big');
  const slider = document.getElementById('time'), readout = document.getElementById('readout');
  const tint = document.getElementById('tint'), plaque = document.getElementById('plaque');
  function render(m) {
    paint(game, CLOCK_SIZE, 3, put => drawClock(m, put));
    paint(big, CLOCK_SIZE, 6, put => drawClock(m, put));
    plaque.textContent = 'Day 3 · ' + fmt(m);
    readout.textContent = fmt(m);
    tint.style.opacity = (light(m) * 0.55).toFixed(2);
  }
  slider.addEventListener('input', () => render(+slider.value));
  let raf = null; const btn = document.getElementById('play');
  btn.addEventListener('click', () => {
    if (raf) { cancelAnimationFrame(raf); raf = null; btn.textContent = 'Play a day'; return; }
    btn.textContent = 'Pause';
    let last = performance.now(), m = +slider.value >= 1560 ? 360 : +slider.value;
    const step = now => { m += ((now - last) / 1000) * (1200 / 24); last = now; if (m >= 1560) m = 360; slider.value = Math.round(m); render(m); raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
  });
  const strip = document.getElementById('strip');
  for (const m of [360, 720, 1110, 1260, 1530]) {
    const cell = document.createElement('div'); cell.className = 'meadow';
    cell.innerHTML = '<div class="tint" style="opacity:' + (light(m) * 0.55).toFixed(2) + '"></div><div class="clock"><canvas></canvas><div class="plaque">Day 3 · ' + fmt(m) + '</div></div>';
    strip.append(cell); paint(cell.querySelector('canvas'), CLOCK_SIZE, 2, put => drawClock(m, put));
  }
  const coins = document.getElementById('coins');
  for (const [s, cap] of [[6, 'Close up, 6×'], [4, 'Shop, 4×'], [3, 'Bag, 3×'], [2, 'HUD, 2×']]) {
    const f = document.createElement('figure'); const cv = document.createElement('canvas'); f.append(cv);
    f.insertAdjacentHTML('beforeend', '<figcaption>' + cap + '</figcaption>'); coins.append(f); paint(cv, COIN_SIZE, s, drawCoin);
  }
  const pf = document.createElement('figure'); pf.innerHTML = '<span class="purse"><canvas></canvas><span>1,250 Rumis</span></span><figcaption>Purse in the HUD</figcaption>';
  coins.append(pf); paint(pf.querySelector('canvas'), COIN_SIZE, 2, drawCoin);
  render(+slider.value);
})();
</script>
`;
writeFileSync(resolve(here, '../clock-preview.html'), page);
console.log('wrote client/clock-preview.html');
