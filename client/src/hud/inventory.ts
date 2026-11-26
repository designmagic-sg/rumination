import { BAG_SIZE, ITEMS, TOOLBAR_SIZE, type Slot } from '@ruminate/shared';
import { COIN_SIZE, canvasPut, drawCoin } from './pixelArt';

/** The toolbar (slots 0–8), the bag panel (all 24 slots) and the purse. */
export function mountInventory(parent: HTMLElement, onSwap: (a: number, b: number) => void) {
  let bag: Slot[] = Array.from({ length: BAG_SIZE }, () => null);
  let selected = 0;
  let picked: number | null = null;

  const bar = document.createElement('div');
  bar.className = 'toolbar';
  const panel = document.createElement('section');
  panel.className = 'bag-panel';
  panel.hidden = true;
  const purse = document.createElement('div');
  purse.className = 'purse';
  const coin = document.createElement('canvas');
  coin.width = COIN_SIZE;
  coin.height = COIN_SIZE;
  drawCoin(canvasPut(coin.getContext('2d')!));
  const amount = document.createElement('span');
  purse.append(coin, amount);
  parent.append(bar, panel, purse);

  function cell(i: number, withKey: boolean) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'slot';
    b.dataset.slot = String(i);
    const s = bag[i];
    if (s) {
      const img = document.createElement('img');
      img.src = `/${ITEMS[s.item].icon}`;
      img.alt = ITEMS[s.item].name;
      b.title = ITEMS[s.item].name;
      b.append(img);
      if (s.count > 1) {
        const n = document.createElement('span');
        n.className = 'count';
        n.textContent = String(s.count);
        b.append(n);
      }
    }
    if (withKey) {
      const k = document.createElement('span');
      k.className = 'key';
      k.textContent = String(i + 1);
      b.append(k);
    }
    return b;
  }

  function render() {
    bar.replaceChildren();
    for (let i = 0; i < TOOLBAR_SIZE; i++) {
      const b = cell(i, true);
      if (i === selected) b.classList.add('selected');
      b.addEventListener('click', () => {
        selected = i;
        render();
      });
      bar.append(b);
    }
    if (!panel.hidden) {
      panel.replaceChildren();
      const h = document.createElement('h2');
      h.textContent = picked === null ? 'Your bag' : 'Pick a slot to swap with';
      const grid = document.createElement('div');
      grid.className = 'bag-grid';
      for (let i = 0; i < BAG_SIZE; i++) {
        const b = cell(i, false);
        if (i === picked) b.classList.add('selected');
        b.addEventListener('click', () => {
          if (picked === null) picked = i;
          else {
            if (picked !== i) onSwap(picked, i);
            picked = null;
          }
          render();
        });
        grid.append(b);
      }
      const hint = document.createElement('p');
      hint.className = 'bag-hint';
      hint.textContent = 'Slots 1–9 are your toolbar. Click two slots to swap them.';
      panel.append(h, grid, hint);
    }
  }
  render();

  return {
    set(next: Slot[], rumis: number) {
      bag = next;
      amount.textContent = `${rumis.toLocaleString('en-GB')} Rumis`;
      render();
    },
    get bag() {
      return bag;
    },
    get selected() {
      return selected;
    },
    select(i: number) {
      selected = ((i % TOOLBAR_SIZE) + TOOLBAR_SIZE) % TOOLBAR_SIZE;
      render();
    },
    toggleBag() {
      panel.hidden = !panel.hidden;
      picked = null;
      render();
    },
  };
}
export type Inventory = ReturnType<typeof mountInventory>;
