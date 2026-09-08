import { weekdayOf } from './dates';
import type { DateKey, DayRates, DayType, Satang } from './types';

/**
 * The day type of a night, decided by the night the guest CHECKS IN, not by
 * the checkout date. A Friday-to-Saturday stay is one FRI night.
 *
 * Precedence, highest first:
 *   HOLIDAY > SAT > FRI > SUN_THU
 *
 * A dated override outranks all of these, but that is decided in overrides.ts;
 * this function reports what the night is before any override applies, which
 * is also what the booking record stores so a bill can be explained later.
 */
export function baseDayType(night: DateKey, holidays: ReadonlySet<DateKey>): DayType {
  if (holidays.has(night)) return 'HOLIDAY';
  const weekday = weekdayOf(night);
  if (weekday === 6) return 'SAT';
  if (weekday === 5) return 'FRI';
  return 'SUN_THU';
}

export function rateForDayType(rates: DayRates, dayType: DayType): Satang {
  switch (dayType) {
    case 'HOLIDAY':
      return rates.holiday;
    case 'SAT':
      return rates.sat;
    case 'FRI':
      return rates.fri;
    case 'SUN_THU':
      return rates.sunThu;
  }
}
