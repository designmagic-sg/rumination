import type { Room } from '@colyseus/sdk';
import { SPECIES, SPECIES_NAMES, cleanNickname, normalizeCode, type Species } from '@ruminate/shared';
import { FriendlyError, createWorld, joinWorld } from '../net';
import { remember } from '../storage';
import './lobby.css';

const BLURBS: Record<Species, string> = {
  ding: 'Loves honey and a tidy row of turnips.',
  chime: 'Winks at every fish that gets away.',
  jingle: 'Reads the quest board twice, just in case.',
  gong: 'Small, leafy, and great at finding shiny rocks.',
};

/** Paint the grass tile from tiles.png at 3x as the lobby background. */
function grassBackground(el: HTMLElement) {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = 16;
    c.getContext('2d')!.drawImage(img, 0, 0, 16, 16, 0, 0, 16, 16);
    el.style.backgroundImage = `url(${c.toDataURL()})`;
  };
  img.src = '/tiles/tiles.png';
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, string> = {}, text?: string) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) el.setAttribute(k, v);
  if (text !== undefined) el.textContent = text;
  return el;
}

export interface LobbyResult {
  room: Room;
  species: Species;
}

/** Shows the lobby until the player is in a world. `notice` is shown first (e.g. after being removed). */
export function showLobby(root: HTMLElement, notice = ''): Promise<LobbyResult> {
  return new Promise(resolve => {
    root.replaceChildren();
    const wrap = h('main', { class: 'lobby' });
    grassBackground(wrap);
    const card = h('div', { class: 'lobby-card' });
    card.append(h('h1', { class: 'title' }, 'RumiNation'), h('p', { class: 'tagline' }, 'Farm, fish and explore with your friends.'));
    const panel = h('section', { class: 'panel' });
    card.append(panel);
    wrap.append(card);
    root.append(wrap);

    let mode: 'create' | 'join' = remember.get('lastCode') ? 'join' : 'create';
    let species: Species = (SPECIES as readonly string[]).includes(remember.get('species') ?? '') ? (remember.get('species') as Species) : 'ding';

    const tabs = h('div', { class: 'tabs', role: 'tablist' });
    const tabCreate = h('button', { class: 'tab', role: 'tab', type: 'button', id: 'tab-create' }, 'Create a world');
    const tabJoin = h('button', { class: 'tab', role: 'tab', type: 'button', id: 'tab-join' }, 'Join with a code');
    tabs.append(tabCreate, tabJoin);

    const form = h('form', { class: 'panel-body', novalidate: '' });
    form.style.display = 'grid';
    form.style.gap = '16px';

    const nameField = h('div', { class: 'field' });
    const worldName = h('input', { id: 'world-name', maxlength: '16', autocomplete: 'off', placeholder: 'Sunny Patch' }) as HTMLInputElement;
    nameField.append(h('label', { for: 'world-name' }, 'World name'), worldName);

    const codeField = h('div', { class: 'field' });
    const codeInput = h('input', { id: 'world-code', class: 'code', maxlength: '12', autocomplete: 'off', placeholder: 'MOON-4823', spellcheck: 'false' }) as HTMLInputElement;
    codeInput.value = remember.get('lastCode') ?? '';
    codeField.append(h('label', { for: 'world-code' }, 'World code'), codeInput);

    const nickField = h('div', { class: 'field' });
    const nick = h('input', { id: 'nickname', maxlength: '16', autocomplete: 'nickname', placeholder: 'Your name' }) as HTMLInputElement;
    nick.value = remember.get('nickname') ?? '';
    nickField.append(h('label', { for: 'nickname' }, 'Your nickname'), nick);

    const row = h('div', { class: 'row2' });
    const pickLabel = h('p', { class: 'pick-label', id: 'pick-label' }, 'Choose your BellPal');
    const picker = h('div', { class: 'picker', role: 'radiogroup', 'aria-labelledby': 'pick-label' });
    const cards = SPECIES.map(sp => {
      const b = h('button', { class: 'pal', type: 'button', role: 'radio', 'data-species': sp });
      const img = h('img', { src: `/sprites/${sp}-front.png`, alt: '' });
      b.append(img, h('span', { class: 'name' }, SPECIES_NAMES[sp]), h('span', { class: 'blurb' }, BLURBS[sp]));
      b.addEventListener('click', () => {
        species = sp;
        render();
      });
      return b;
    });
    picker.append(...cards);

    const error = h('p', { class: 'error', role: 'alert' }, notice);
    const go = h('button', { class: 'go', type: 'submit' }) as HTMLButtonElement;

    form.append(row, pickLabel, picker, error, go);
    panel.append(tabs, form);

    function render() {
      tabCreate.setAttribute('aria-selected', String(mode === 'create'));
      tabJoin.setAttribute('aria-selected', String(mode === 'join'));
      row.replaceChildren(mode === 'create' ? nameField : codeField, nickField);
      go.textContent = mode === 'create' ? 'Create world' : 'Join world';
      for (const c of cards) c.setAttribute('aria-checked', String(c.dataset.species === species));
    }
    tabCreate.addEventListener('click', () => {
      mode = 'create';
      error.textContent = '';
      render();
    });
    tabJoin.addEventListener('click', () => {
      mode = 'join';
      error.textContent = '';
      render();
    });
    render();

    async function enter(code: string, name: string) {
      const room = await joinWorld(code, name, species);
      remember.set('lastCode', normalizeCode(code) ?? code);
      resolve({ room, species });
    }

    function showCode(code: string, name: string) {
      const box = h('div', { class: 'code-box' });
      box.append(
        h('p', { class: 'hint' }, 'Your world is ready. Send this code to your friends so they can join:'),
        h('div', { class: 'code-big', id: 'new-code' }, code),
      );
      const actions = h('div', { class: 'code-actions' });
      const copy = h('button', { class: 'go secondary', type: 'button' }, 'Copy code') as HTMLButtonElement;
      copy.addEventListener('click', () => {
        navigator.clipboard?.writeText(code).then(
          () => (copy.textContent = 'Copied!'),
          () => getSelection()?.selectAllChildren(box.querySelector('.code-big')!),
        );
      });
      const enterBtn = h('button', { class: 'go', type: 'button', id: 'enter-world' }, 'Enter world') as HTMLButtonElement;
      const err = h('p', { class: 'error', role: 'alert' });
      enterBtn.addEventListener('click', async () => {
        enterBtn.disabled = true;
        try {
          await enter(code, name);
        } catch (e) {
          err.textContent = e instanceof FriendlyError ? e.message : 'Something went wrong. Try again.';
          enterBtn.disabled = false;
        }
      });
      actions.append(copy, enterBtn);
      box.append(actions, err);
      panel.replaceChildren(box);
    }

    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      error.textContent = '';
      const name = cleanNickname(nick.value);
      if (!name) {
        error.textContent = 'Pick a nickname first.';
        nick.focus();
        return;
      }
      remember.set('nickname', name);
      remember.set('species', species);
      go.disabled = true;
      try {
        if (mode === 'create') {
          const world = cleanNickname(worldName.value);
          if (!world) {
            error.textContent = 'Give your world a name.';
            worldName.focus();
            return;
          }
          const code = await createWorld(world);
          remember.set('lastCode', code);
          showCode(code, name);
        } else {
          if (!normalizeCode(codeInput.value)) {
            error.textContent = 'Codes look like MOON-4823.';
            codeInput.focus();
            return;
          }
          await enter(codeInput.value, name);
        }
      } catch (e) {
        error.textContent = e instanceof FriendlyError ? e.message : 'Something went wrong. Try again.';
      } finally {
        go.disabled = false;
      }
    });
  });
}
