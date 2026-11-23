/** In-game time. `minute` counts from midnight of `day` and runs past 1440 until FAINT_AT (02:00 next morning). */
export interface Clock {
  day: number;
  minute: number;
}

export const MS_PER_GAME_MINUTE = 1000;
export const DAY_START = 6 * 60;
export const FAINT_AT = 24 * 60 + 2 * 60;
export const DUSK_START = 18 * 60;
export const NIGHT_START = 20 * 60;

export function advanceClock(clock: Clock, elapsedMs: number): { clock: Clock; fainted: boolean } {
  const minute = Math.min(FAINT_AT, clock.minute + elapsedMs / MS_PER_GAME_MINUTE);
  return { clock: { day: clock.day, minute }, fainted: minute >= FAINT_AT };
}

export function startNextDay(clock: Clock): Clock {
  return { day: clock.day + 1, minute: DAY_START };
}

const pad = (n: number) => String(n).padStart(2, '0');

export function formatClock(clock: Clock): string {
  const m = Math.floor(clock.minute) % 1440;
  return `Day ${clock.day} · ${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** 0 = full daylight, 1 = full night. Dusk ramps from 18:00 to 20:00; night holds until the day ends at 02:00. */
export function lightLevel(minute: number): number {
  if (minute < DUSK_START) return 0;
  if (minute < NIGHT_START) return (minute - DUSK_START) / (NIGHT_START - DUSK_START);
  return 1;
}

/** Angle of the clock's sun arm in radians, clockwise from straight up; noon = 0, midnight = π. */
export function sunAngle(minute: number): number {
  return ((minute - 720) / 1440) * Math.PI * 2;
}
