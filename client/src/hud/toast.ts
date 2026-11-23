/** Short messages at the bottom of the screen. */
export function mountToasts(parent: HTMLElement) {
  const box = document.createElement('div');
  box.className = 'toasts';
  box.setAttribute('role', 'status');
  parent.append(box);
  return {
    show(text: string, ms = 3500) {
      const t = document.createElement('div');
      t.className = 'toast';
      t.textContent = text;
      box.append(t);
      setTimeout(() => t.remove(), ms);
    },
  };
}
export type Toasts = ReturnType<typeof mountToasts>;
