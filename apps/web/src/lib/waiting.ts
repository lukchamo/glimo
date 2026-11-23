// "It has been waiting for you": who needs the person, and for how long, in words.

import type { GlimState, Locale } from '@glimo/spec';
import { COPY } from './i18n';

/** The two states that call the person back: the agent cannot go on without them. */
export function callsYou(state: GlimState | undefined): boolean {
  return state === 'waiting' || state === 'blocked';
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Midnight (local time) of the day a timestamp falls on. */
function dayOf(time: number): number {
  const date = new Date(time);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * How long since `updatedAt`, the way a teammate would say it: "for 12 min", "for 2 h",
 * "since yesterday". Whole units, rounded down; from 24 hours on it counts calendar days.
 * A timestamp in the future (two clocks never agree) reads as "just now". One that is not
 * a date gives null, and nothing is shown.
 */
export function sinceLabel(locale: Locale, updatedAt: string, now: number): string | null {
  const then = Date.parse(updatedAt);
  if (!Number.isFinite(then) || !Number.isFinite(now)) return null;
  const copy = COPY[locale].since;
  const elapsed = now - then;
  if (elapsed < MINUTE) return copy.now;
  if (elapsed < HOUR) return copy.minutes(Math.floor(elapsed / MINUTE));
  if (elapsed < DAY) return copy.hours(Math.floor(elapsed / HOUR));
  // Rounded: a day is 23 or 25 hours long when the clocks change.
  const days = Math.round((dayOf(now) - dayOf(then)) / DAY);
  return days <= 1 ? copy.yesterday : copy.days(days);
}

/** Tab title: the summary, with the number of agents that need the person in front. */
export function tabTitle(headline: string, needing: number): string {
  return `${needing > 0 ? `(${needing}) ` : ''}${headline} · Glimo`;
}
