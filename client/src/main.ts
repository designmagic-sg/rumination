import { showLobby } from './lobby/lobby';
import { startGame } from './game/start';

const root = document.getElementById('app')!;

async function run(notice = '') {
  await Promise.all([document.fonts.load('16px "Pixelify Sans"'), document.fonts.load('16px VT323')]).catch(() => {});
  const { room, species } = await showLobby(root, notice);
  const reason = await startGame(root, room, species);
  run(reason);
}

run();
