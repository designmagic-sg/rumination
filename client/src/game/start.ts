import type { Room } from '@colyseus/sdk';
import type { Species } from '@ruminate/shared';

/** Runs the game until the player leaves the world; resolves with a message for the lobby. Filled in by Task 8. */
export function startGame(root: HTMLElement, room: Room, _species: Species): Promise<string> {
  root.replaceChildren();
  const p = document.createElement('p');
  p.textContent = `Joined ${room.roomId}`;
  root.append(p);
  return new Promise(resolve => room.onLeave(() => resolve('')));
}
