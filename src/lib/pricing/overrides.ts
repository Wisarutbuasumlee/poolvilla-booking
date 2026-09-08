import { inclusiveDayCount, isWithin } from './dates';
import type { DateKey, DayType, PriceOverride } from './types';

/**
 * Which dated override applies to a night, when several could.
 *
 * The ranking has to be TOTAL and independent of array order. Mongoose keeps
 * subdocuments in insertion order, which is not a business decision, so a
 * ranking that fell back on "first match wins" would quietly reprice a stay
 * the next time somebody edited an unrelated festival window.
 *
 * Order of tie-breaks, first difference wins:
 *
 *   1. A specific day type beats 'ALL'.
 *      "Songkran, Saturdays only" is a more deliberate statement than
 *      "Songkran, every night".
 *   2. The narrower window wins.
 *      A one-day New Year's Eve rate beats a two-week peak-season rate.
 *   3. The later start date wins.
 *      A newer promotional window supersedes an older blanket one.
 *   4. The higher price wins.
 *      Deterministic, and it never silently gives away the cheaper rate.
 *   5. Lexicographic id.
 *      Guarantees totality so the result can never depend on ordering.
 */
export function selectOverride(
  night: DateKey,
  dayType: DayType,
  overrides: readonly PriceOverride[],
): PriceOverride | null {
  let best: PriceOverride | null = null;

  for (const candidate of overrides) {
    if (!appliesTo(candidate, night, dayType)) continue;
    if (best === null || compareSpecificity(candidate, best) < 0) {
      best = candidate;
    }
  }

  return best;
}

/** True when this override covers the night AND targets its day type. */
export function appliesTo(
  override: PriceOverride,
  night: DateKey,
  dayType: DayType,
): boolean {
  if (!isWithin(night, override.startDate, override.endDate)) return false;
  return override.dayTypes.includes(dayType) || override.dayTypes.includes('ALL');
}

/** Negative when `a` is more specific than `b`. */
export function compareSpecificity(a: PriceOverride, b: PriceOverride): number {
  const aExact = a.dayTypes.includes('ALL') ? 1 : 0;
  const bExact = b.dayTypes.includes('ALL') ? 1 : 0;
  if (aExact !== bExact) return aExact - bExact;

  const aSpan = inclusiveDayCount(a.startDate, a.endDate);
  const bSpan = inclusiveDayCount(b.startDate, b.endDate);
  if (aSpan !== bSpan) return aSpan - bSpan;

  if (a.startDate !== b.startDate) return a.startDate < b.startDate ? 1 : -1;

  if (a.price !== b.price) return b.price - a.price;

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Every override that actually applies to at least one night of the stay.
 *
 * Used for the minimum-nights rule, which follows override APPLICATION and not
 * mere date overlap. A "Songkran, Saturdays only, 3 nights minimum" rule sits
 * inside a Sunday-to-Tuesday stay's date range but touches none of its nights,
 * so it must not impose its minimum.
 */
export function appliedOverrides(
  nights: readonly { date: DateKey; dayType: DayType }[],
  overrides: readonly PriceOverride[],
): PriceOverride[] {
  const applied = new Map<string, PriceOverride>();

  for (const night of nights) {
    const winner = selectOverride(night.date, night.dayType, overrides);
    if (winner) applied.set(winner.id, winner);
  }

  return [...applied.values()];
}
