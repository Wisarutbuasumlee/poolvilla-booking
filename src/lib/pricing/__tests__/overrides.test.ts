import { describe, expect, it } from 'vitest';
import { asDateKey } from '../dates';
import { baht } from '../money';
import { appliedOverrides, appliesTo, selectOverride } from '../overrides';
import type { DayType, PriceOverride } from '../types';
import { makeOverride, SAT, SONGKRAN_1, SONGKRAN_2, SONGKRAN_3, SUN } from './fixtures';

const d = asDateKey;

/** Selection must be independent of array order, so every case is run both ways. */
function selectBothWays(
  night: Parameters<typeof selectOverride>[0],
  dayType: DayType,
  overrides: PriceOverride[],
): PriceOverride | null {
  const forwards = selectOverride(night, dayType, overrides);
  const backwards = selectOverride(night, dayType, [...overrides].reverse());
  expect(backwards?.id).toBe(forwards?.id);
  return forwards;
}

describe('appliesTo', () => {
  const songkran = makeOverride({ id: 'songkran', dayTypes: ['ALL'] });

  it('is inclusive on both ends of the window', () => {
    expect(appliesTo(songkran, SONGKRAN_1, 'HOLIDAY')).toBe(true);
    expect(appliesTo(songkran, SONGKRAN_3, 'HOLIDAY')).toBe(true);
  });

  it('excludes nights outside the window', () => {
    expect(appliesTo(songkran, d('2026-04-12'), 'HOLIDAY')).toBe(false);
    expect(appliesTo(songkran, d('2026-04-16'), 'HOLIDAY')).toBe(false);
  });

  it('respects the day-type filter', () => {
    const saturdaysOnly = makeOverride({ id: 'sat-only', dayTypes: ['SAT'] });
    expect(appliesTo(saturdaysOnly, SONGKRAN_1, 'SAT')).toBe(true);
    expect(appliesTo(saturdaysOnly, SONGKRAN_1, 'FRI')).toBe(false);
    expect(appliesTo(saturdaysOnly, SONGKRAN_1, 'HOLIDAY')).toBe(false);
  });

  it("treats 'ALL' as matching every day type", () => {
    for (const dayType of ['SUN_THU', 'FRI', 'SAT', 'HOLIDAY'] as const) {
      expect(appliesTo(songkran, SONGKRAN_2, dayType)).toBe(true);
    }
  });
});

describe('selectOverride tie-breaks', () => {
  it('returns null when nothing applies', () => {
    expect(selectOverride(SUN, 'SUN_THU', [])).toBeNull();
    expect(selectOverride(SUN, 'SUN_THU', [makeOverride({ id: 'x' })])).toBeNull();
  });

  it('1. a specific day type beats ALL', () => {
    const all = makeOverride({ id: 'all', dayTypes: ['ALL'], price: baht(20000) });
    const satOnly = makeOverride({ id: 'sat', dayTypes: ['SAT'], price: baht(18000) });

    const winner = selectBothWays(SONGKRAN_1, 'SAT', [all, satOnly]);
    expect(winner?.id).toBe('sat');
  });

  it('2. a narrower window beats a wider one', () => {
    const fortnight = makeOverride({
      id: 'peak',
      startDate: d('2026-04-05'),
      endDate: d('2026-04-18'),
      price: baht(18000),
    });
    const oneDay = makeOverride({
      id: 'nye',
      startDate: SONGKRAN_2,
      endDate: SONGKRAN_2,
      price: baht(25000),
    });

    const winner = selectBothWays(SONGKRAN_2, 'HOLIDAY', [fortnight, oneDay]);
    expect(winner?.id).toBe('nye');
  });

  it('3. the later start date wins when the spans are equal', () => {
    const older = makeOverride({
      id: 'older',
      startDate: d('2026-04-10'),
      endDate: d('2026-04-14'),
      price: baht(18000),
    });
    const newer = makeOverride({
      id: 'newer',
      startDate: d('2026-04-11'),
      endDate: d('2026-04-15'),
      price: baht(18000),
    });

    const winner = selectBothWays(SONGKRAN_2, 'HOLIDAY', [older, newer]);
    expect(winner?.id).toBe('newer');
  });

  it('4. the higher price wins, so a tie never gives the rate away', () => {
    const cheap = makeOverride({ id: 'cheap', price: baht(18000) });
    const dear = makeOverride({ id: 'dear', price: baht(22000) });

    const winner = selectBothWays(SONGKRAN_2, 'HOLIDAY', [cheap, dear]);
    expect(winner?.id).toBe('dear');
    expect(winner?.price).toBe(baht(22000));
  });

  it('5. the id breaks a total tie, so the result never depends on order', () => {
    const a = makeOverride({ id: 'aaa' });
    const b = makeOverride({ id: 'bbb' });

    expect(selectBothWays(SONGKRAN_2, 'HOLIDAY', [a, b])?.id).toBe('aaa');
  });

  it('a half-covered window leaves the other nights on their day-type rate', () => {
    // Very common in practice: "Saturdays during peak season cost more".
    const saturdaysOnly = makeOverride({
      id: 'sat-peak',
      startDate: d('2026-03-01'),
      endDate: d('2026-03-31'),
      dayTypes: ['SAT'],
    });

    expect(selectOverride(SAT, 'SAT', [saturdaysOnly])?.id).toBe('sat-peak');
    expect(selectOverride(SUN, 'SUN_THU', [saturdaysOnly])).toBeNull();
  });
});

describe('appliedOverrides', () => {
  const nights = [
    { date: SONGKRAN_1, dayType: 'HOLIDAY' as const },
    { date: SONGKRAN_2, dayType: 'HOLIDAY' as const },
  ];

  it('reports each winning override once', () => {
    const songkran = makeOverride({ id: 'songkran' });
    expect(appliedOverrides(nights, [songkran]).map((o) => o.id)).toEqual(['songkran']);
  });

  it('ignores an override that overlaps the dates but prices no night', () => {
    // This is the trap the minimum-nights rule depends on. A "Saturdays only"
    // window can sit inside a Monday-to-Wednesday stay and touch nothing,
    // so it must not impose its 3-night minimum.
    const saturdaysOnly = makeOverride({
      id: 'sat-only',
      startDate: d('2026-04-01'),
      endDate: d('2026-04-30'),
      dayTypes: ['SAT'],
      minNights: 3,
    });

    expect(appliedOverrides(nights, [saturdaysOnly])).toEqual([]);
  });

  it('reports only the winner when several overlap', () => {
    const wide = makeOverride({
      id: 'wide',
      startDate: d('2026-04-01'),
      endDate: d('2026-04-30'),
    });
    const narrow = makeOverride({ id: 'narrow', startDate: SONGKRAN_1, endDate: SONGKRAN_1 });

    const applied = appliedOverrides(nights, [wide, narrow]).map((o) => o.id).sort();
    expect(applied).toEqual(['narrow', 'wide']);
  });
});
