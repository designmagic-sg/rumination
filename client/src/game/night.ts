import Phaser from 'phaser';
import { lightLevel } from '@ruminate/shared';

const TINT = 0x1b1f4a;
const MAX_DARK = 0.55;
const MORNING_MS = 2000;
const LIT_AT = 0.4;

/** A stepped, pixel-style pool of warm light, drawn once into a texture. */
function makeGlowTexture(scene: Phaser.Scene) {
  if (scene.textures.exists('glow')) return;
  const size = 48;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const bands: [number, string][] = [
    [24, 'rgba(255, 210, 122, 0.16)'],
    [17, 'rgba(255, 210, 122, 0.28)'],
    [10, 'rgba(255, 226, 160, 0.42)'],
  ];
  for (const [r, colour] of bands) {
    ctx.fillStyle = colour;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) if (Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) <= r) ctx.fillRect(x, y, 1, 1);
  }
  scene.textures.addCanvas('glow', c);
}

/** Where light comes from on each prop, relative to the prop image's top-left corner. */
const LIGHTS: Record<string, [number, number][]> = {
  house: [[22, 56], [68, 56]],
  lamp: [[8, 7]],
};

/**
 * Night over the world: a blue tint that deepens from 18:00, lit windows and lamps with pools of light,
 * and a short fade back to daylight each morning.
 */
export function mountNight(scene: Phaser.Scene, props: Phaser.GameObjects.Image[]) {
  makeGlowTexture(scene);
  let overlay: Phaser.GameObjects.Rectangle | null = null;
  let glows: Phaser.GameObjects.Image[] = [];
  let morningAt = -Infinity;

  return {
    /** Call after a zone is built, with its size in pixels. */
    rebuild(width: number, height: number) {
      overlay?.destroy();
      for (const g of glows) g.destroy();
      glows = [];
      // Bigger than the map so the edges stay dark when a small map is centred on a large screen.
      overlay = scene.add.rectangle(-400, -400, width + 800, height + 800, TINT, 0).setOrigin(0, 0).setDepth(50000);
      for (const img of props) {
        for (const [dx, dy] of LIGHTS[img.getData('kind') as string] ?? []) {
          glows.push(
            scene.add.image(img.x + dx, img.y + dy, 'glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(50001).setAlpha(0),
          );
        }
      }
    },
    set(minute: number) {
      const level = lightLevel(minute);
      const fade = Math.max(0, 1 - (scene.time.now - morningAt) / MORNING_MS);
      overlay?.setFillStyle(TINT, Math.max(level, fade) * MAX_DARK);
      const lit = level >= LIT_AT;
      for (const g of glows) g.setAlpha(lit ? level : 0);
      for (const img of props) {
        const kind = img.getData('kind') as string;
        if (kind === 'house' || kind === 'lamp') img.setTexture(lit ? `${kind}-lit` : kind);
      }
    },
    /** Fade from night to day over two seconds, after sleeping or fainting. */
    morning() {
      morningAt = scene.time.now;
    },
  };
}
