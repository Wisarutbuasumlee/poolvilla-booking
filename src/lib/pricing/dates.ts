import type { DateKey, Weekday } from './types';

/**
 * The only module in the pricing engine allowed to touch Date.
 *
 * Asia/Bangkok is UTC+7 and has had no daylight saving since 1920, so the
 * offset is a constant. That is exactly why this is easy to get wrong: the
 * code looks fine on a laptop set to Bangkok time and produces a different
 * calendar day on a UTC server, which shows up as "prices are wrong for
 * bookings made after 5pm" and is miserable to reproduce.
 *
 * The fix is to never ask a Date what day it is in the host's timezone. A
 * DateKey is a civil date; weekday comes from UTC midnight of that same civil
 * date, which is offset-free and identical on every machine.
 */

export const BANGKOK_UTC_OFFSET_MINUTES = 420;

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/** Validates the shape AND that it is a real calendar date. */
export function asDateKey(value: string): DateKey {
  const match = DATE_KEY.exec(value);
  if (!match) {
    throw new TypeError(`Not a DateKey: ${JSON.stringify(value)} (expected YYYY-MM-DD)`);
  }
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);

  const utc = Date.UTC(year, month - 1, day);
  const roundTrip = new Date(utc);
  // Rejects 2026-02-30, which Date.UTC would silently roll into March.
  if (
    roundTrip.getUTCFullYear() !== year ||
    roundTrip.getUTCMonth() !== month - 1 ||
    roundTrip.getUTCDate() !== day
  ) {
    throw new RangeError(`Not a real date: ${value}`);
  }
  return value as DateKey;
}

export function isDateKey(value: unknown): value is DateKey {
  if (typeof value !== 'string') return false;
  try {
    asDateKey(value);
    return true;
  } catch {
    return false;
  }
}

/** The civil date in Bangkok at a given instant. */
export function dateKeyFromInstant(instant: Date): DateKey {
  const shifted = new Date(instant.getTime() + BANGKOK_UTC_OFFSET_MINUTES * 60_000);
  return shifted.toISOString().slice(0, 10) as DateKey;
}

/** UTC midnight of the civil date. For MongoDB range queries and iCal only. */
export function dateKeyToUtcMidnight(key: DateKey): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

/** The instant that civil date begins in Bangkok. */
export function dateKeyToBangkokStart(key: DateKey): Date {
  return new Date(Date.parse(`${key}T00:00:00.000Z`) - BANGKOK_UTC_OFFSET_MINUTES * 60_000);
}

/**
 * Weekday of the civil date, 0 = Sunday.
 *
 * UTC midnight of a civil date always lands on that date's own weekday, on
 * any host timezone. Using getDay() here instead would be the single most
 * damaging bug available in this codebase.
 */
export function weekdayOf(key: DateKey): Weekday {
  return new Date(`${key}T00:00:00.000Z`).getUTCDay() as Weekday;
}

export function addDays(key: DateKey, days: number): DateKey {
  const next = new Date(Date.parse(`${key}T00:00:00.000Z`) + days * MS_PER_DAY);
  return next.toISOString().slice(0, 10) as DateKey;
}

/** Nights between two civil dates. checkOut is exclusive. */
export function nightsBetween(checkIn: DateKey, checkOut: DateKey): number {
  const from = Date.parse(`${checkIn}T00:00:00.000Z`);
  const to = Date.parse(`${checkOut}T00:00:00.000Z`);
  return Math.round((to - from) / MS_PER_DAY);
}

/**
 * Every night of a stay: [checkIn, checkOut).
 *
 * The checkout date is never a night. That is what makes same-day turnover
 * work with no special case: one guest checks out at noon on the 12th and the
 * next checks in at 2pm on the 12th, and neither holds that date.
 */
export function eachNight(checkIn: DateKey, checkOut: DateKey): DateKey[] {
  const count = nightsBetween(checkIn, checkOut);
  if (count <= 0) return [];
  const out: DateKey[] = new Array(count);
  let cursor = checkIn;
  for (let i = 0; i < count; i += 1) {
    out[i] = cursor;
    cursor = addDays(cursor, 1);
  }
  return out;
}

/** Inclusive on both ends. Lexicographic comparison is chronological for this format. */
export function isWithin(key: DateKey, start: DateKey, end: DateKey): boolean {
  return key >= start && key <= end;
}

/** How many days an override covers, inclusive. Used for the specificity tie-break. */
export function inclusiveDayCount(start: DateKey, end: DateKey): number {
  return nightsBetween(start, end) + 1;
}

/** Today's civil date in Bangkok. */
export function todayBangkok(now: Date = new Date()): DateKey {
  return dateKeyFromInstant(now);
}
