import { baseDayType, rateForDayType } from './day-type';
import { eachNight, weekdayOf } from './dates';
import { add } from './money';
import { selectOverride } from './overrides';
import type { DateKey, NightLine, PriceRule, RateCard } from './types';

/**
 * Resolves one night into its two layers.
 *
 * The company owns `base`; the agent adds `markup` on top. They are resolved
 * independently against the same night, so the company can raise its rates
 * without touching a single agent record, and a booking can still report how
 * much of every night belonged to whom.
 *
 * A dated override REPLACES its layer's day-type value rather than adding to
 * it. That is true on both layers, so a festival window reads the same way
 * whichever one declared it.
 */
export function resolveNight(
  night: DateKey,
  rateCard: RateCard,
  holidays: ReadonlySet<DateKey>,
): NightLine {
  const dayType = baseDayType(night, holidays);

  const baseOverride = selectOverride(night, dayType, rateCard.baseOverrides);
  const basePrice = baseOverride ? baseOverride.price : rateForDayType(rateCard.base, dayType);

  const markupOverride = selectOverride(night, dayType, rateCard.markupOverrides);
  const markup = markupOverride ? markupOverride.price : rateForDayType(rateCard.markup, dayType);

  const line: NightLine = {
    date: night,
    weekday: weekdayOf(night),
    dayType,
    basePrice,
    baseRule: baseOverride ? 'OVERRIDE' : (dayType as PriceRule),
    markup,
    markupRule: markupOverride ? 'OVERRIDE' : (dayType as PriceRule),
    price: add(basePrice, markup),
  };

  if (baseOverride) line.baseOverrideId = baseOverride.id;
  if (markupOverride) line.markupOverrideId = markupOverride.id;

  return line;
}

export function resolveNights(
  checkIn: DateKey,
  checkOut: DateKey,
  rateCard: RateCard,
  holidays: ReadonlySet<DateKey>,
): NightLine[] {
  return eachNight(checkIn, checkOut).map((night) => resolveNight(night, rateCard, holidays));
}
