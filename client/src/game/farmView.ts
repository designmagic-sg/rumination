import Phaser from 'phaser';
import { CROP_IDS, TILE, type ZoneMap } from '@ruminate/shared';
import { TILE_FRAMES } from './tiles';

/** The synced soil fields the view reads. */
interface SoilLike {
  watered: boolean;
  crop: string;
  stage: number;
}

const STAGE_FILES = ['stage0', 'stage1', 'stage2', 'ripe'];

export function preloadFarm(scene: Phaser.Scene) {
  for (const c of CROP_IDS) STAGE_FILES.forEach((f, i) => scene.load.image(`crop-${c}-${i}`, `/crops/${c}-${f}.png`));
}

/** Draws tilled soil and crops from the synced state, and the cursor on the tile in front of the player. */
export function mountFarmView(scene: Phaser.Scene) {
  const tiles = new Map<string, { soil: Phaser.GameObjects.Image; crop?: Phaser.GameObjects.Image }>();
  const cursor = scene.add.rectangle(0, 0, TILE - 1, TILE - 1).setOrigin(0, 0).setStrokeStyle(1, 0xfff6ea, 0.9).setDepth(50002).setVisible(false);

  function clear() {
    for (const t of tiles.values()) {
      t.soil.destroy();
      t.crop?.destroy();
    }
    tiles.clear();
  }

  return {
    /** Call every frame with the synced soil map (only drawn on the farm). */
    sync(zone: ZoneMap, soil: { forEach(cb: (s: SoilLike, key: string) => void): void } | undefined) {
      if (zone.id !== 'farm' || !soil) {
        if (tiles.size) clear();
        return;
      }
      const seen = new Set<string>();
      soil.forEach((s, key) => {
        seen.add(key);
        const [tx, ty] = key.split(',').map(Number) as [number, number];
        let t = tiles.get(key);
        if (!t) {
          t = { soil: scene.add.image(tx * TILE, ty * TILE, 'tiles', TILE_FRAMES.soil).setOrigin(0, 0).setDepth(-5) };
          tiles.set(key, t);
        }
        t.soil.setFrame(s.watered ? TILE_FRAMES['soil-wet'] : TILE_FRAMES.soil);
        const tex = s.crop ? `crop-${s.crop}-${Math.max(0, Math.min(3, s.stage))}` : '';
        if (!tex) {
          t.crop?.destroy();
          t.crop = undefined;
        } else if (!t.crop) {
          t.crop = scene.add.image(tx * TILE + 8, ty * TILE + TILE - 1, tex).setOrigin(0.5, 1).setDepth(ty * TILE + TILE - 2);
        } else if (t.crop.texture.key !== tex) {
          t.crop.setTexture(tex);
        }
      });
      for (const [key, t] of tiles) {
        if (!seen.has(key)) {
          t.soil.destroy();
          t.crop?.destroy();
          tiles.delete(key);
        }
      }
    },
    /** Show the cursor on a tile, or hide it with null. */
    target(tile: { x: number; y: number } | null) {
      cursor.setVisible(!!tile);
      if (tile) cursor.setPosition(tile.x * TILE, tile.y * TILE);
    },
    clear,
  };
}
