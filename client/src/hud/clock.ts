import { formatClock, type Clock } from '@ruminate/shared';
import { CLOCK_SIZE, canvasPut, drawClock } from './pixelArt';

const SCALE = 3;

/** The pixel day clock in the HUD corner. Redraws only when the in-game minute changes. */
export function mountClock(parent: HTMLElement) {
  const canvas = document.createElement('canvas');
  canvas.width = CLOCK_SIZE;
  canvas.height = CLOCK_SIZE;
  canvas.className = 'pixel-clock';
  canvas.style.width = `${CLOCK_SIZE * SCALE}px`;
  canvas.style.height = `${CLOCK_SIZE * SCALE}px`;
  canvas.setAttribute('role', 'img');
  parent.append(canvas);
  const ctx = canvas.getContext('2d')!;
  const put = canvasPut(ctx);
  let shown = -1;
  return {
    set(clock: Clock) {
      const m = Math.floor(clock.minute);
      if (m === shown) return;
      shown = m;
      ctx.clearRect(0, 0, CLOCK_SIZE, CLOCK_SIZE);
      drawClock(m, put);
      canvas.setAttribute('aria-label', formatClock(clock));
    },
    destroy() {
      canvas.remove();
    },
  };
}
