// End-to-end check: two browsers meet in one world.
// Starts `npm run dev` (server :2567, client :5173), creates a world in page A, joins it from page B
// with the code typed loosely (lowercase, a space instead of the dash), walks A for a second, and
// checks B sees two players. Screenshots go to e2e/out/. Exits 0 on success.
// Run from the repo root: node e2e/two-players.mjs
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'e2e/out');
mkdirSync(out, { recursive: true });

const dev = spawn('npm', ['run', 'dev'], {
  cwd: root,
  env: { ...process.env, DB_PATH: resolve(out, 'e2e.db') },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
let log = '';
dev.stdout.on('data', d => (log += d));
dev.stderr.on('data', d => (log += d));
const stop = () => {
  try {
    process.kill(-dev.pid, 'SIGTERM');
  } catch {
    /* already gone */
  }
};

async function waitForUrl(url, ms = 60_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      /* not up yet */
    }
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error(`${url} did not come up.\n${log}`);
}

let browser;
try {
  await waitForUrl('http://localhost:2567/api/worlds/NOPE-2222');
  await waitForUrl('http://localhost:5173/');
  browser = await chromium.launch();
  const errors = [];
  const page = async () => {
    const p = await browser.newPage({ viewport: { width: 960, height: 640 } });
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => m.type() === 'error' && errors.push(m.text()));
    return p;
  };
  const A = await page();
  const B = await page();

  await A.goto('http://localhost:5173/');
  await A.fill('#world-name', 'E2E Patch');
  await A.fill('#nickname', 'Aris');
  await A.click('[data-species="ding"]');
  await A.click('button.go');
  await A.waitForSelector('#new-code');
  const code = (await A.textContent('#new-code')).trim();
  await A.click('#enter-world');
  await A.waitForSelector('canvas');

  await B.goto('http://localhost:5173/');
  await B.click('#tab-join');
  await B.fill('#world-code', code.toLowerCase().replace('-', ' '));
  await B.fill('#nickname', 'Bo');
  await B.click('[data-species="chime"]');
  await B.click('button.go');
  await B.waitForSelector('canvas');

  await A.waitForTimeout(1200);
  const before = await A.evaluate(() => window.__ruminate.me());
  await A.click('canvas');
  await A.keyboard.down('d');
  await A.waitForTimeout(1000);
  await A.keyboard.up('d');
  await A.waitForTimeout(600);

  const seen = await B.evaluate(() => window.__ruminate.players());
  const aPos = await A.evaluate(() => window.__ruminate.me());
  await A.screenshot({ path: resolve(out, 'a.png') });
  await B.screenshot({ path: resolve(out, 'b.png') });

  if (seen !== 2) throw new Error(`B sees ${seen} players, expected 2`);
  if (!(aPos.x > before.x + 40)) throw new Error(`A did not walk: ${JSON.stringify(aPos)}`);
  if (errors.length) throw new Error(`Console errors: ${errors.join(' | ')}`);
  console.log(`two players met in ${code}`);
  await browser.close();
  stop();
  process.exit(0);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  await browser?.close().catch(() => {});
  stop();
  process.exit(1);
}
