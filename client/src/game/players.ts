import Phaser from 'phaser';
import type { Facing } from '@ruminate/shared';

/** What a PlayerView needs to draw someone. Matches the synced PlayerState fields. */
export interface PlayerLook {
  nickname: string;
  species: string;
  facing: string;
  moving: boolean;
  emote: string;
  inBed: boolean;
}

const STEP_MS = 180;
const TAG_FONT = '"Pixelify Sans", monospace';

/** One player's sprite and name tag. Position is the player's feet, in world pixels. */
export class PlayerView {
  readonly sprite: Phaser.GameObjects.Image;
  readonly tag: Phaser.GameObjects.Text;
  private clock = 0;
  private species: string;

  constructor(scene: Phaser.Scene, look: PlayerLook, isMe: boolean) {
    this.species = look.species;
    this.sprite = scene.add.image(0, 0, `${look.species}-front`).setOrigin(0.5, 1);
    this.tag = scene.add
      .text(0, 0, look.nickname, {
        fontFamily: TAG_FONT,
        fontSize: '8px',
        color: isMe ? '#F2C14E' : '#FFFFFF',
        stroke: '#412234',
        strokeThickness: 2,
        resolution: 3,
      })
      .setOrigin(0.5, 1);
  }

  update(x: number, y: number, look: PlayerLook, dtMs: number) {
    this.clock += dtMs;
    const step = Math.floor(this.clock / STEP_MS) % 2;
    let pose = 'front';
    let flip = false;
    let lift = 0;
    const facing = look.facing as Facing;
    if (look.emote === 'jump') {
      pose = 'jump';
      lift = Math.round(Math.abs(Math.sin(this.clock / 160)) * 5);
    } else if (look.emote === 'sit' || look.emote === 'sleep') {
      pose = look.emote;
    } else if (facing === 'up') {
      pose = 'back';
      lift = look.moving ? step : 0;
    } else if (facing === 'left' || facing === 'right') {
      pose = 'side';
      flip = facing === 'left';
      lift = look.moving ? step : 0;
    } else {
      pose = look.moving && step ? 'walk' : 'front';
    }
    // +4: the sprite's bottom edge sits a little below the feet point, on the hitbox's lower edge.
    const fx = Math.round(x);
    const fy = Math.round(y) + 4;
    this.sprite.setTexture(`${this.species}-${pose}`).setFlipX(flip).setPosition(fx, fy - lift).setDepth(fy);
    this.tag.setText(look.nickname).setPosition(fx, fy - this.sprite.height - 1 - lift).setDepth(100000);
    const visible = !look.inBed;
    this.sprite.setVisible(visible);
    this.tag.setVisible(visible);
  }

  destroy() {
    this.sprite.destroy();
    this.tag.destroy();
  }
}
