import { describe, expect, it } from 'vitest';
import { advanceClock, formatClock, lightLevel, startNextDay, sunAngle } from '../src/time';

describe('advanceClock', () => {
  it('moves one game minute per real second', () => {
    expect(advanceClock({ day: 1, minute: 360 }, 60_000)).toEqual({ clock: { day: 1, minute: 420 }, fainted: false });
  });
  it('stops at 02:00 and reports fainting', () => {
    expect(advanceClock({ day: 1, minute: 1550 }, 30_000)).toEqual({ clock: { day: 1, minute: 1560 }, fainted: true });
  });
  it('keeps fractional progress out of the minute count', () => {
    expect(advanceClock({ day: 1, minute: 360 }, 999).clock.minute).toBe(360.999);
  });
});

describe('startNextDay', () => {
  it('starts the next morning at 06:00', () => {
    expect(startNextDay({ day: 4, minute: 1560 })).toEqual({ day: 5, minute: 360 });
  });
});

describe('formatClock', () => {
  it('shows the day and time', () => expect(formatClock({ day: 3, minute: 1085 })).toBe('Day 3 · 18:05'));
  it('wraps past midnight', () => expect(formatClock({ day: 3, minute: 1500 })).toBe('Day 3 · 01:00'));
  it('rounds down fractional minutes', () => expect(formatClock({ day: 1, minute: 360.9 })).toBe('Day 1 · 06:00'));
});

describe('lightLevel', () => {
  it.each([[720, 0], [1140, 0.5], [1200, 1], [1500, 1], [360, 0]])('at minute %i is %f', (m, level) => {
    expect(lightLevel(m)).toBeCloseTo(level);
  });
});

describe('sunAngle', () => {
  it('puts noon straight up', () => expect(sunAngle(720)).toBeCloseTo(0));
  it('puts midnight straight down', () => expect(sunAngle(1440)).toBeCloseTo(Math.PI));
});
