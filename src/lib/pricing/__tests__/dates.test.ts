import { describe, expect, it } from 'vitest';
import {
  addDays,
  asDateKey,
  dateKeyFromInstant,
  dateKeyToBangkokStart,
  eachNight,
  inclusiveDayCount,
  isDateKey,
  isWithin,
  nightsBetween,
  todayBangkok,
  weekdayOf,
} from '../dates';
import { FRI, MON, SAT, SUN, THU, WED } from './fixtures';

/**
 * This file runs three times, on UTC, Asia/Bangkok and America/Los_Angeles.
 * Every assertion here must hold identically on all three. See vitest.config.ts.
 */

describe('asDateKey', () => {
  it('accepts a real calendar date', () => {
    expect(asDateKey('2026-03-04')).toBe('2026-03-04');
  });

  it('rejects a malformed string', () => {
    expect(() => asDateKey('2026-3-4')).toThrow(TypeError);
    expect(() => asDateKey('04/03/2026')).toThrow(TypeError);
    expect(() => asDateKey('')).toThrow(TypeError);
  });

  it('rejects a date that does not exist', () => {
    // Date.UTC would silently roll this into 2 March.
    expect(() => asDateKey('2026-02-30')).toThrow(RangeError);
    expect(() => asDateKey('2026-13-01')).toThrow(RangeError);
    // 2026 is not a leap year.
    expect(() => asDateKey('2026-02-29')).toThrow(RangeError);
  });

  it('accepts the leap day in a leap year', () => {
    expect(asDateKey('2028-02-29')).toBe('2028-02-29');
  });

  it('isDateKey never throws', () => {
    expect(isDateKey('2026-02-30')).toBe(false);
    expect(isDateKey(20260304)).toBe(false);
    expect(isDateKey('2026-03-04')).toBe(true);
  });
});

describe('weekdayOf', () => {
  it('reads the civil date, not the host timezone', () => {
    expect(weekdayOf(WED)).toBe(3);
    expect(weekdayOf(THU)).toBe(4);
    expect(weekdayOf(FRI)).toBe(5);
    expect(weekdayOf(SAT)).toBe(6);
    expect(weekdayOf(SUN)).toBe(0);
    expect(weekdayOf(MON)).toBe(1);
  });

  it('is stable across a year of dates', () => {
    let cursor = asDateKey('2026-01-01');
    let expected = weekdayOf(cursor);
    for (let i = 0; i < 365; i += 1) {
      expect(weekdayOf(cursor)).toBe(expected);
      cursor = addDays(cursor, 1);
      expected = ((expected + 1) % 7) as ReturnType<typeof weekdayOf>;
    }
  });
});

describe('dateKeyFromInstant', () => {
  it('maps an instant to the Bangkok civil date', () => {
    // 16:59:59Z is 23:59:59 in Bangkok, still the 1st.
    expect(dateKeyFromInstant(new Date('2026-01-01T16:59:59.000Z'))).toBe('2026-01-01');
    // 17:00:00Z is midnight in Bangkok, already the 2nd.
    expect(dateKeyFromInstant(new Date('2026-01-01T17:00:00.000Z'))).toBe('2026-01-02');
  });

  it('handles the evening bookings that break naive implementations', () => {
    // 23:30 Bangkok on 1 January, still the 1st.
    expect(dateKeyFromInstant(new Date('2026-01-01T16:30:00.000Z'))).toBe('2026-01-01');

    // 01:00 Bangkok on 2 January. This is the case that catches a naive
    // implementation: the calendar day differs between UTC and Bangkok, so a
    // server that answers in its own timezone books the wrong night.
    expect(dateKeyFromInstant(new Date('2026-01-01T18:00:00.000Z'))).toBe('2026-01-02');
  });

  it('round-trips through dateKeyToBangkokStart', () => {
    const key = asDateKey('2026-07-04');
    expect(dateKeyFromInstant(dateKeyToBangkokStart(key))).toBe(key);
  });
});

describe('addDays', () => {
  it('crosses a month boundary', () => {
    expect(addDays(asDateKey('2026-01-31'), 1)).toBe('2026-02-01');
  });

  it('crosses a year boundary', () => {
    expect(addDays(asDateKey('2026-12-31'), 1)).toBe('2027-01-01');
  });

  it('crosses a leap day', () => {
    expect(addDays(asDateKey('2028-02-28'), 1)).toBe('2028-02-29');
    expect(addDays(asDateKey('2028-02-29'), 1)).toBe('2028-03-01');
  });

  it('skips 29 February in a non-leap year', () => {
    expect(addDays(asDateKey('2026-02-28'), 1)).toBe('2026-03-01');
  });

  it('goes backwards', () => {
    expect(addDays(asDateKey('2026-03-01'), -1)).toBe('2026-02-28');
  });
});

describe('nightsBetween', () => {
  it('counts nights, not dates', () => {
    expect(nightsBetween(FRI, SAT)).toBe(1);
    expect(nightsBetween(FRI, SUN)).toBe(2);
    expect(nightsBetween(THU, MON)).toBe(4);
  });

  it('is zero for the same day and negative when reversed', () => {
    expect(nightsBetween(FRI, FRI)).toBe(0);
    expect(nightsBetween(SAT, FRI)).toBe(-1);
  });

  it('counts across a leap day', () => {
    expect(nightsBetween(asDateKey('2028-02-27'), asDateKey('2028-03-02'))).toBe(4);
  });
});

describe('eachNight', () => {
  it('excludes the checkout date', () => {
    expect(eachNight(FRI, SUN)).toEqual([FRI, SAT]);
  });

  it('returns nothing for a zero or negative range', () => {
    expect(eachNight(FRI, FRI)).toEqual([]);
    expect(eachNight(SAT, FRI)).toEqual([]);
  });

  it('has no off-by-one over a long stay', () => {
    const nights = eachNight(asDateKey('2026-03-01'), asDateKey('2026-03-31'));
    expect(nights).toHaveLength(30);
    expect(nights[0]).toBe('2026-03-01');
    expect(nights[29]).toBe('2026-03-30');
  });

  it('includes the leap day', () => {
    expect(eachNight(asDateKey('2028-02-27'), asDateKey('2028-03-02'))).toContain('2028-02-29');
  });
});

describe('isWithin and inclusiveDayCount', () => {
  it('is inclusive on both ends', () => {
    expect(isWithin(FRI, FRI, SUN)).toBe(true);
    expect(isWithin(SUN, FRI, SUN)).toBe(true);
    expect(isWithin(MON, FRI, SUN)).toBe(false);
    expect(isWithin(THU, FRI, SUN)).toBe(false);
  });

  it('counts a single-day window as one day', () => {
    expect(inclusiveDayCount(FRI, FRI)).toBe(1);
    expect(inclusiveDayCount(FRI, SUN)).toBe(3);
  });
});

describe('todayBangkok', () => {
  it('is derived from the supplied instant, not the host clock', () => {
    expect(todayBangkok(new Date('2026-06-15T20:00:00.000Z'))).toBe('2026-06-16');
    expect(todayBangkok(new Date('2026-06-15T10:00:00.000Z'))).toBe('2026-06-15');
  });
});
