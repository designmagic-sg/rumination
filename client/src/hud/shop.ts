import { CROPS, CROP_IDS, ITEMS, shopIsOpen, type Slot } from '@ruminate/shared';

/** The market stall: buy seeds, sell crops. The server checks hours, reach and money. */
export function mountShop(parent: HTMLElement, actions: { buy(item: string, count: number): void; sell(slot: number, count: number): void }) {
  const panel = document.createElement('section');
  panel.className = 'shop-panel';
  panel.hidden = true;
  parent.append(panel);
  let bag: Slot[] = [];
  let rumis = 0;
  let open = true;

  function button(text: string, disabled: boolean, onClick: () => void) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mini';
    b.textContent = text;
    b.disabled = disabled;
    b.addEventListener('click', onClick);
    return b;
  }
  function row(icon: string, name: string, price: string, ...buttons: HTMLElement[]) {
    const li = document.createElement('li');
    const img = document.createElement('img');
    img.src = `/${icon}`;
    img.alt = '';
    const n = document.createElement('span');
    n.className = 'name';
    n.textContent = name;
    const p = document.createElement('span');
    p.className = 'price';
    p.textContent = price;
    li.append(img, n, p, ...buttons);
    return li;
  }

  function render() {
    if (panel.hidden) return;
    panel.replaceChildren();
    const head = document.createElement('div');
    head.className = 'shop-head';
    const h = document.createElement('h2');
    h.textContent = 'Market stall';
    head.append(h, button('Close', false, () => api.close()));
    if (!open) {
      const note = document.createElement('p');
      note.className = 'bag-hint';
      note.textContent = 'The stall is closed. It opens at 08:00 and closes at 18:00.';
      panel.append(head, note);
      return;
    }
    const buyH = document.createElement('h3');
    buyH.textContent = 'Buy seeds';
    const buyList = document.createElement('ul');
    for (const c of CROP_IDS) {
      const price = CROPS[c].seedPrice;
      buyList.append(
        row(ITEMS[`seed-${c}`].icon, ITEMS[`seed-${c}`].name, `◎ ${price}`,
          button('Buy 1', rumis < price, () => actions.buy(`seed-${c}`, 1)),
          button('Buy 10', rumis < price * 10, () => actions.buy(`seed-${c}`, 10))),
      );
    }
    const sellH = document.createElement('h3');
    sellH.textContent = 'Sell your harvest';
    const sellList = document.createElement('ul');
    bag.forEach((s, i) => {
      if (!s || ITEMS[s.item].kind !== 'crop') return;
      const price = CROPS[s.item as keyof typeof CROPS].sellPrice;
      sellList.append(
        row(ITEMS[s.item].icon, `${ITEMS[s.item].name} ×${s.count}`, `◎ ${price}`,
          button('Sell 1', false, () => actions.sell(i, 1)),
          button('Sell all', false, () => actions.sell(i, s.count))),
      );
    });
    if (!sellList.children.length) {
      const none = document.createElement('p');
      none.className = 'bag-hint';
      none.textContent = 'Nothing to sell yet. Grow something!';
      panel.append(head, buyH, buyList, sellH, none);
    } else {
      panel.append(head, buyH, buyList, sellH, sellList);
    }
  }

  const api = {
    get open() {
      return !panel.hidden;
    },
    show() {
      panel.hidden = false;
      render();
    },
    close() {
      panel.hidden = true;
    },
    /** Call with the world clock; redraws only when the stall opens or closes. */
    setTime(minute: number) {
      const now = shopIsOpen(minute);
      if (now !== open) {
        open = now;
        render();
      }
    },
    get isOpen() {
      return open;
    },
    set(next: Slot[], money: number) {
      bag = next;
      rumis = money;
      render();
    },
  };
  return api;
}
export type Shop = ReturnType<typeof mountShop>;
