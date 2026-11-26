import type { Toasts } from './toast';
import { mountToasts } from './toast';
import './hud.css';

export interface PlayerRow {
  sessionId: string;
  nickname: string;
  species: string;
  isOwner: boolean;
  isMe: boolean;
}

/** The DOM layer over the game: clock corner, world code, prompts, toasts and the players list. */
export function mountHud(parent: HTMLElement, world: { name: string; code: string }, onLeave: () => void) {
  const hud = document.createElement('div');
  hud.className = 'hud';
  parent.append(hud);

  const corner = document.createElement('div');
  corner.className = 'hud-corner';
  const clockSlot = document.createElement('div');
  clockSlot.className = 'clock-slot';
  const plaque = document.createElement('div');
  plaque.className = 'plaque';
  const card = document.createElement('div');
  card.className = 'world-card';
  const name = document.createElement('span');
  name.textContent = world.name;
  const code = document.createElement('span');
  code.className = 'code';
  code.textContent = world.code;
  const copy = document.createElement('button');
  copy.className = 'mini';
  copy.type = 'button';
  copy.textContent = 'Copy';
  copy.addEventListener('click', () => {
    navigator.clipboard?.writeText(world.code).then(
      () => {
        copy.textContent = 'Copied';
        setTimeout(() => (copy.textContent = 'Copy'), 1500);
      },
      () => getSelection()?.selectAllChildren(code),
    );
  });
  const leave = document.createElement('button');
  leave.className = 'mini';
  leave.type = 'button';
  leave.textContent = 'Leave';
  leave.addEventListener('click', onLeave);
  card.append(name, code, copy, leave);
  corner.append(clockSlot, plaque, card);

  const prompt = document.createElement('div');
  prompt.className = 'prompt';
  prompt.hidden = true;

  const help = document.createElement('div');
  help.className = 'help';
  help.innerHTML =
    '<kbd>WASD</kbd> move · <kbd>E</kbd>/click use · <kbd>1–9</kbd> pick · <kbd>Tab</kbd> bag · <kbd>Z</kbd><kbd>X</kbd><kbd>C</kbd> emotes · <kbd>P</kbd> players';

  const panel = document.createElement('section');
  panel.className = 'players-panel';
  panel.hidden = true;

  hud.append(corner, prompt, help, panel);
  const toasts: Toasts = mountToasts(hud);

  let confirming: string | null = null;
  let lastSig = '';
  let last: { rows: PlayerRow[]; amOwner: boolean; onKick: (sessionId: string) => void } | null = null;
  const redraw = () => {
    lastSig = '';
    if (last) api.renderPlayers(last.rows, last.amOwner, last.onKick);
  };

  const api = {
    /** The HUD layer, for panels that mount themselves. */
    root: hud,
    clockSlot,
    toasts,
    setWorldName(text: string) {
      name.textContent = text;
    },
    setTime(text: string) {
      plaque.textContent = text;
    },
    setPrompt(key: string | null, text = '') {
      if (!key) {
        prompt.hidden = true;
        return;
      }
      prompt.replaceChildren();
      const k = document.createElement('kbd');
      k.textContent = key;
      prompt.append(k, document.createTextNode(text));
      prompt.hidden = false;
    },
    get playersOpen() {
      return !panel.hidden;
    },
    togglePlayers(open = panel.hidden) {
      panel.hidden = !open;
      confirming = null;
      redraw();
    },
    /** Redraws the players list. `onKick` is only offered when I'm the owner. */
    renderPlayers(rows: PlayerRow[], amOwner: boolean, onKick: (sessionId: string) => void) {
      last = { rows, amOwner, onKick };
      if (panel.hidden) return;
      const sig = JSON.stringify([rows, amOwner, confirming]);
      if (sig === lastSig) return;
      lastSig = sig;
      panel.replaceChildren();
      const title = document.createElement('h2');
      title.textContent = `In this world (${rows.length}/8)`;
      const list = document.createElement('ul');
      for (const r of rows) {
        const li = document.createElement('li');
        const img = document.createElement('img');
        img.src = `/sprites/${r.species}-front.png`;
        img.alt = '';
        const who = document.createElement('span');
        who.className = 'who';
        who.textContent = r.nickname + (r.isMe ? ' (you)' : '');
        li.append(img, who);
        if (r.isOwner) {
          const o = document.createElement('span');
          o.className = 'owner';
          o.textContent = 'owner';
          li.append(o);
        }
        if (amOwner && !r.isMe) {
          if (confirming === r.sessionId) {
            const yes = document.createElement('button');
            yes.className = 'mini';
            yes.type = 'button';
            yes.textContent = 'Remove';
            yes.addEventListener('click', () => {
              confirming = null;
              onKick(r.sessionId);
              redraw();
            });
            const no = document.createElement('button');
            no.className = 'mini';
            no.type = 'button';
            no.textContent = 'Keep';
            no.addEventListener('click', () => {
              confirming = null;
              redraw();
            });
            li.append(yes, no);
          } else {
            const b = document.createElement('button');
            b.className = 'mini';
            b.type = 'button';
            b.textContent = 'Remove…';
            b.dataset.kick = r.sessionId;
            b.addEventListener('click', () => {
              confirming = r.sessionId;
              redraw();
            });
            li.append(b);
          }
        }
        list.append(li);
      }
      panel.append(title, list);
    },
    destroy() {
      hud.remove();
    },
  };
  return api;
}
export type Hud = ReturnType<typeof mountHud>;
