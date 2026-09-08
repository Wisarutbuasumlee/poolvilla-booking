import { describe, expect, it } from 'vitest';
import { baseDayType, rateForDayType } from '../day-type';
import { resolveGuests } from '../guests';
import { baht } from '../money';
import { BASE_RATES, CAPACITY, FRI, guests, MON, NO_HOLIDAYS, SAT, SONGKRAN_1, SONGKRAN_HOLIDAYS, SUN, THU, WED } from './fixtures';

describe('baseDayType', () => {
  it('reads the check-in night, and Saturday is its own type', () => {
    expect(baseDayType(SAT, NO_HOLIDAYS)).toBe('SAT');
    expect(baseDayType(FRI, NO_HOLIDAYS)).toBe('FRI');
  });

  it('groups Sunday to Thursday', () => {
    expect(baseDayType(SUN, NO_HOLIDAYS)).toBe('SUN_THU');
    expect(baseDayType(MON, NO_HOLIDAYS)).toBe('SUN_THU');
    expect(baseDayType(WED, NO_HOLIDAYS)).toBe('SUN_THU');
    expect(baseDayType(THU, NO_HOLIDAYS)).toBe('SUN_THU');
  });

  it('lets a holiday outrank Saturday and Friday', () => {
    expect(baseDayType(SAT, new Set([SAT]))).toBe('HOLIDAY');
    expect(baseDayType(FRI, new Set([FRI]))).toBe('HOLIDAY');
  });

  it('prices a Songkran weekday as a holiday', () => {
    // 13 April 2026 is a Monday, so without the holiday row it would be the
    // cheapest rate of the week.
    expect(baseDayType(SONGKRAN_1, NO_HOLIDAYS)).toBe('SUN_THU');
    expect(baseDayType(SONGKRAN_1, SONGKRAN_HOLIDAYS)).toBe('HOLIDAY');
  });

  it('falls back to weekday pricing with an empty holiday set', () => {
    expect(baseDayType(SONGKRAN_1, new Set())).toBe('SUN_THU');
  });
});

describe('rateForDayType', () => {
  it('maps each day type to its own rate', () => {
    expect(rateForDayType(BASE_RATES, 'SUN_THU')).toBe(baht(9000));
    expect(rateForDayType(BASE_RATES, 'FRI')).toBe(baht(11000));
    expect(rateForDayType(BASE_RATES, 'SAT')).toBe(baht(13000));
    expect(rateForDayType(BASE_RATES, 'HOLIDAY')).toBe(baht(15000));
  });
});

describe('resolveGuests', () => {
  it('charges nothing extra at exactly the base capacity', () => {
    const result = resolveGuests(guests(20), CAPACITY);
    expect(result).toMatchObject({ total: 20, extraGuests: 0, overCapacityBy: 0 });
  });

  it('counts guests above the base capacity as extra', () => {
    expect(resolveGuests(guests(23), CAPACITY).extraGuests).toBe(3);
  });

  it('takes free children off the top, so they never create an extra guest', () => {
    // 20 adults plus 3 under-10s in a villa that sleeps 20. Charging for the
    // children here is the complaint this rule exists to prevent.
    const result = resolveGuests(guests(20, 3, 3), CAPACITY);
    expect(result.freeChildrenApplied).toBe(3);
    expect(result.chargeableGuests).toBe(20);
    expect(result.extraGuests).toBe(0);
  });

  it('caps the free allowance at the villa quota', () => {
    const result = resolveGuests(guests(20, 7, 7), CAPACITY);
    expect(result.freeChildrenApplied).toBe(5);
    expect(result.chargeableGuests).toBe(22);
    expect(result.extraGuests).toBe(2);
  });

  it('charges children who are ten or older', () => {
    // Four children, only two of them under ten.
    const result = resolveGuests(guests(20, 4, 2), CAPACITY);
    expect(result.freeChildrenApplied).toBe(2);
    expect(result.chargeableGuests).toBe(22);
    expect(result.extraGuests).toBe(2);
  });

  it('reports how far over the hard maximum a party is', () => {
    // 20 base + 15 extra = 35 chargeable maximum.
    const result = resolveGuests(guests(36), CAPACITY);
    expect(result.overCapacityBy).toBe(1);
    expect(result.extraGuests).toBe(16);
  });

  it('is at the limit, not over it, at exactly the maximum', () => {
    expect(resolveGuests(guests(35), CAPACITY).overCapacityBy).toBe(0);
  });

  it('handles a villa with no free-child allowance', () => {
    const strict = { ...CAPACITY, freeChildUnder10Quota: 0 };
    const result = resolveGuests(guests(20, 3, 3), strict);
    expect(result.freeChildrenApplied).toBe(0);
    expect(result.extraGuests).toBe(3);
  });
});
