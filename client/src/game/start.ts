import Phaser from 'phaser';
import type { Room } from '@colyseus/sdk';
import type { Species } from '@ruminate/shared';
import { mountHud } from '../hud/hud';
import { WorldScene } from './WorldScene';

/** Runs the game until the player leaves the world; resolves with a message for the lobby. */
export function startGame(root: HTMLElement, room: Room, species: Species): Promise<string> {
  root.replaceChildren();
  const stage = document.createElement('div');
  stage.className = 'game-root';
  root.append(stage);
  const hud = mountHud(stage, { name: '', code: room.roomId }, () => room.leave());

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: stage,
    pixelArt: true,
    roundPixels: true,
    backgroundColor: '#76A062',
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    banner: false,
  });
  game.scene.add('world', WorldScene, true, { room, species, hud });

  let reason = '';
  room.onMessage('kicked', (msg: string) => (reason = String(msg)));
  return new Promise(resolve => {
    room.onLeave(code => {
      game.destroy(true);
      hud.destroy();
      if (!reason && code !== 1000 && code !== 4000) reason = 'You were disconnected from the world.';
      resolve(reason);
    });
  });
}
