/**
 * The pricing engine's public surface.
 *
 * Import from '@/lib/pricing', never from a file inside it. Everything here is
 * a pure function: no database, no environment, no clock beyond what is passed
 * in. That is what lets the search page price twenty villas without twenty
 * extra queries, and what makes every case in __tests__ reproducible.
 */

export { quote, effectiveMinNights } from './quote';
export { resolveNight, resolveNights } from './rates';
export { resolveGuests } from './guests';
export { baseDayType, rateForDayType } from './day-type';
export { selectOverride, appliesTo, appliedOverrides, compareSpecificity } from './overrides';
export { applyPromotion } from './promotions';

export {
  asDateKey,
  isDateKey,
  addDays,
  eachNight,
  nightsBetween,
  isWithin,
  weekdayOf,
  todayBangkok,
  dateKeyFromInstant,
  dateKeyToUtcMidnight,
  dateKeyToBangkokStart,
  inclusiveDayCount,
  BANGKOK_UTC_OFFSET_MINUTES,
} from './dates';

export { baht, toBaht, satang, add, subtract, multiply, percentOf, clamp, max, ZERO } from './money';

export type * from './types';
