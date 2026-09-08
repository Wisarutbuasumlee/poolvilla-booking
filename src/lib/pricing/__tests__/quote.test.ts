import { describe, expect, it } from 'vitest';
import { asDateKey } from '../dates';
import { baht } from '../money';
import { quote } from '../quote';
import type { QuoteInput } from '../types';
import {
  BASE_RATES,
  CAPACITY,
  FRI,
  guests,
  makeAgentRateCard,
  makeOverride,
  makeRateCard,
  MARKUP_RATES,
  MON,
  NO_HOLIDAYS,
  SAT,
  SETTINGS,
  SONGKRAN_1,
  SONGKRAN_3,
  SONGKRAN_EVE,
  SONGKRAN_HOLIDAYS,
  SONGKRAN_OUT,
  SUN,
  THU,
  WED,
} from './fixtures';

const d = asDateKey;

function input(overrides: Partial<QuoteInput> = {}): QuoteInput {
  return {
    checkIn: FRI,
    checkOut: SUN,
    rateCard: makeRateCard(),
    capacity: CAPACITY,
    holidays: NO_HOLIDAYS,
    guests: guests(20),
    settings: SETTINGS,
    ...overrides,
  };
}

describe('night resolution', () => {
  it('prices a single Friday night as FRI, decided by check-in', () => {
    const result = quote(input({ checkIn: FRI, checkOut: SAT }));
    expect(result.nights).toBe(1);
    expect(result.lines.map((l) => l.dayType)).toEqual(['FRI']);
    expect(result.accommodationTotal).toBe(BASE_RATES.fri);
  });

  it('prices a single Saturday night as SAT', () => {
    const result = quote(input({ checkIn: SAT, checkOut: SUN }));
    expect(result.lines.map((l) => l.dayType)).toEqual(['SAT']);
  });

  it('prices a weekend as Friday then Saturday', () => {
    const result = quote(input({ checkIn: FRI, checkOut: SUN }));
    expect(result.lines.map((l) => l.dayType)).toEqual(['FRI', 'SAT']);
    expect(result.accommodationTotal).toBe(baht(11000 + 13000));
  });

  it('straddles a week correctly', () => {
    // Thursday to Monday: Thu, Fri, Sat, Sun.
    const result = quote(input({ checkIn: THU, checkOut: MON }));
    expect(result.lines.map((l) => l.dayType)).toEqual(['SUN_THU', 'FRI', 'SAT', 'SUN_THU']);
    expect(result.accommodationTotal).toBe(baht(9000 + 11000 + 13000 + 9000));
  });

  it('has exactly one Friday and one Saturday in a full week', () => {
    const result = quote(input({ checkIn: d('2026-03-01'), checkOut: d('2026-03-08') }));
    expect(result.nights).toBe(7);
    const types = result.lines.map((l) => l.dayType);
    expect(types.filter((t) => t === 'FRI')).toHaveLength(1);
    expect(types.filter((t) => t === 'SAT')).toHaveLength(1);
    expect(types.filter((t) => t === 'SUN_THU')).toHaveLength(5);
  });

  it('crosses a month boundary', () => {
    const result = quote(input({ checkIn: d('2026-01-30'), checkOut: d('2026-02-02') }));
    expect(result.lines.map((l) => l.date)).toEqual(['2026-01-30', '2026-01-31', '2026-02-01']);
  });

  it('crosses a year boundary', () => {
    const result = quote(input({ checkIn: d('2026-12-30'), checkOut: d('2027-01-02') }));
    expect(result.nights).toBe(3);
    expect(result.lines[2]?.date).toBe('2027-01-01');
  });

  it('includes the leap day', () => {
    const result = quote(input({ checkIn: d('2028-02-27'), checkOut: d('2028-03-02') }));
    expect(result.lines.map((l) => l.date)).toContain('2028-02-29');
  });

  it('has no off-by-one over a long stay', () => {
    const result = quote(input({ checkIn: d('2026-03-01'), checkOut: d('2026-03-31') }));
    expect(result.nights).toBe(30);
    expect(result.lines).toHaveLength(30);
  });

  it('throws on a zero-night or reversed range', () => {
    expect(() => quote(input({ checkIn: FRI, checkOut: FRI }))).toThrow(RangeError);
    expect(() => quote(input({ checkIn: SAT, checkOut: FRI }))).toThrow(RangeError);
  });
});

describe('holidays', () => {
  const songkran = { holidays: SONGKRAN_HOLIDAYS };

  it('prices every Songkran night as a holiday even on weekdays', () => {
    const result = quote(input({ ...songkran, checkIn: SONGKRAN_1, checkOut: SONGKRAN_OUT }));
    expect(result.lines.map((l) => l.dayType)).toEqual(['HOLIDAY', 'HOLIDAY', 'HOLIDAY']);
    expect(result.accommodationTotal).toBe(baht(15000 * 3));
  });

  it('lets the holiday rate beat the Saturday rate', () => {
    const result = quote(
      input({ checkIn: SAT, checkOut: SUN, holidays: new Set([SAT]) }),
    );
    expect(result.lines[0]?.dayType).toBe('HOLIDAY');
    expect(result.accommodationTotal).toBe(BASE_RATES.holiday);
  });

  it('charges the eve as a holiday because it is a real row, not an inference', () => {
    // 12 April 2026 is a Sunday. It prices as a holiday only because the
    // holidays collection contains it as a long-weekend eve.
    const result = quote(input({ ...songkran, checkIn: SONGKRAN_EVE, checkOut: SONGKRAN_1 }));
    expect(result.lines[0]?.dayType).toBe('HOLIDAY');
  });

  it('does not charge a holiday for a checkout date', () => {
    // Checking out on the first day of Songkran must not pay the holiday rate.
    const result = quote(
      input({ ...songkran, checkIn: d('2026-04-11'), checkOut: SONGKRAN_EVE }),
    );
    expect(result.lines.map((l) => l.dayType)).toEqual(['SAT']);
  });
});

describe('the two pricing layers', () => {
  it('charges the base rate alone when no agent referred the guest', () => {
    const result = quote(input({ checkIn: FRI, checkOut: SAT }));
    expect(result.baseAccommodationTotal).toBe(baht(11000));
    expect(result.markupTotal).toBe(baht(0));
    expect(result.accommodationTotal).toBe(baht(11000));
  });

  it('adds the agent markup on top, by day type', () => {
    const result = quote(
      input({ checkIn: FRI, checkOut: SUN, rateCard: makeAgentRateCard() }),
    );
    expect(result.baseAccommodationTotal).toBe(baht(11000 + 13000));
    expect(result.markupTotal).toBe(baht(1500 + 2000));
    expect(result.accommodationTotal).toBe(baht(11000 + 13000 + 1500 + 2000));
  });

  it('reports each night split into its two layers', () => {
    const result = quote(input({ checkIn: SAT, checkOut: SUN, rateCard: makeAgentRateCard() }));
    const night = result.lines[0]!;
    expect(night.basePrice).toBe(BASE_RATES.sat);
    expect(night.markup).toBe(MARKUP_RATES.sat);
    expect(night.price).toBe(baht(13000 + 2000));
  });

  it('moves every agent price when the company raises its base rate', () => {
    const raised = makeAgentRateCard({
      base: { ...BASE_RATES, sat: baht(14000) },
    });
    const result = quote(input({ checkIn: SAT, checkOut: SUN, rateCard: raised }));
    // The agent record was not touched, but their price moved with the base.
    expect(result.accommodationTotal).toBe(baht(14000 + 2000));
  });

  it('lets a base override replace the base while the markup still applies', () => {
    const rateCard = makeAgentRateCard({
      baseOverrides: [makeOverride({ id: 'songkran', price: baht(20000) })],
    });
    const result = quote(
      input({
        checkIn: SONGKRAN_1,
        checkOut: SONGKRAN_3,
        holidays: SONGKRAN_HOLIDAYS,
        rateCard,
      }),
    );
    // Base replaced by the override, markup still the holiday markup.
    expect(result.lines[0]?.basePrice).toBe(baht(20000));
    expect(result.lines[0]?.baseRule).toBe('OVERRIDE');
    expect(result.lines[0]?.markup).toBe(MARKUP_RATES.holiday);
    expect(result.lines[0]?.price).toBe(baht(23000));
  });

  it('lets an agent set their own festival markup', () => {
    const rateCard = makeAgentRateCard({
      markupOverrides: [makeOverride({ id: 'agent-songkran', price: baht(5000) })],
    });
    const result = quote(
      input({
        checkIn: SONGKRAN_1,
        checkOut: SONGKRAN_3,
        holidays: SONGKRAN_HOLIDAYS,
        rateCard,
      }),
    );
    expect(result.lines[0]?.markup).toBe(baht(5000));
    expect(result.lines[0]?.markupRule).toBe('OVERRIDE');
    expect(result.lines[0]?.price).toBe(baht(15000 + 5000));
  });
});

describe('extra guests', () => {
  it('charges per extra guest per night', () => {
    const result = quote(input({ checkIn: FRI, checkOut: SUN, guests: guests(23) }));
    expect(result.guests.extraGuests).toBe(3);
    expect(result.extraGuestTotal).toBe(baht(200 * 3 * 2));
  });

  it('is flat per night regardless of day type', () => {
    const weekend = quote(input({ checkIn: FRI, checkOut: SUN, guests: guests(23) }));
    const midweek = quote(input({ checkIn: WED, checkOut: FRI, guests: guests(23) }));
    expect(weekend.extraGuestTotal).toBe(midweek.extraGuestTotal);
  });

  it('adds no line when the villa charges nothing for extra guests', () => {
    const rateCard = makeRateCard({ extraGuestFee: baht(0) });
    const result = quote(input({ rateCard, guests: guests(25) }));
    expect(result.extraGuestTotal).toBe(baht(0));
  });

  it('flags a party over the hard maximum but still prices it', () => {
    const result = quote(input({ guests: guests(36) }));
    expect(result.isBookable).toBe(false);
    expect(result.violations.map((v) => v.code)).toContain('OVER_CAPACITY');
    expect(result.grandTotal).toBeGreaterThan(0);
  });
});

describe('minimum nights', () => {
  it('flags a stay shorter than the rate card minimum, without throwing', () => {
    const rateCard = makeRateCard({ minNights: 2 });
    const result = quote(input({ checkIn: FRI, checkOut: SAT, rateCard }));

    expect(result.isBookable).toBe(false);
    expect(result.violations[0]).toMatchObject({
      code: 'MIN_NIGHTS',
      meta: { required: 2, actual: 1, source: 'rateCard' },
    });
    // Still fully priced, so the page can say what it would have cost.
    expect(result.grandTotal).toBe(baht(11000));
  });

  it('takes the minimum from an override that prices one of the nights', () => {
    const rateCard = makeRateCard({
      minNights: 1,
      baseOverrides: [makeOverride({ id: 'songkran', minNights: 3 })],
    });
    const result = quote(
      input({
        checkIn: SONGKRAN_1,
        checkOut: d('2026-04-15'),
        holidays: SONGKRAN_HOLIDAYS,
        rateCard,
      }),
    );

    expect(result.minNights).toEqual({ value: 3, source: 'override:songkran' });
    expect(result.violations.map((v) => v.code)).toContain('MIN_NIGHTS');
  });

  it('takes the largest minimum when several overrides apply', () => {
    const rateCard = makeRateCard({
      baseOverrides: [makeOverride({ id: 'a', minNights: 3 })],
      markupOverrides: [makeOverride({ id: 'b', minNights: 5 })],
    });
    const result = quote(
      input({
        checkIn: SONGKRAN_1,
        checkOut: SONGKRAN_3,
        holidays: SONGKRAN_HOLIDAYS,
        rateCard,
      }),
    );
    expect(result.minNights.value).toBe(5);
  });

  it('ignores an override whose day-type filter excludes every night', () => {
    // The window covers all of April, but only Saturdays, and this stay has
    // none. Its 3-night minimum must not apply.
    const rateCard = makeRateCard({
      minNights: 1,
      baseOverrides: [
        makeOverride({
          id: 'sat-only',
          startDate: d('2026-04-01'),
          endDate: d('2026-04-30'),
          dayTypes: ['SAT'],
          minNights: 3,
        }),
      ],
    });
    const result = quote(
      input({ checkIn: SONGKRAN_1, checkOut: d('2026-04-14'), holidays: SONGKRAN_HOLIDAYS, rateCard }),
    );

    expect(result.minNights).toEqual({ value: 1, source: 'rateCard' });
    expect(result.isBookable).toBe(true);
  });
});

describe('totals, deposit and commission', () => {
  it('keeps the damage deposit out of the total', () => {
    const result = quote(input({ checkIn: FRI, checkOut: SAT }));
    expect(result.grandTotal).toBe(baht(11000));
    expect(result.damageDeposit).toBe(baht(3000));
  });

  it('takes the deposit as a percentage of the grand total', () => {
    const result = quote(input({ checkIn: FRI, checkOut: SUN }));
    expect(result.grandTotal).toBe(baht(24000));
    expect(result.depositRequired).toBe(baht(7200));
    expect(result.balanceDue).toBe(baht(16800));
  });

  it("lets a villa's own deposit percentage win over the default", () => {
    const rateCard = makeRateCard({ depositPercent: 50 });
    const result = quote(input({ checkIn: FRI, checkOut: SUN, rateCard }));
    expect(result.depositRequired).toBe(baht(12000));
  });

  it('always has deposit plus balance equal to the grand total', () => {
    for (const percent of [0, 13, 30, 33, 50, 100]) {
      const result = quote(input({ settings: { ...SETTINGS, depositPercent: percent } }));
      expect(result.depositRequired + result.balanceDue).toBe(result.grandTotal);
    }
  });

  it('calculates commission on the company share, not on the agent markup', () => {
    const rateCard = makeAgentRateCard({ commissionRate: 0.1 });
    const result = quote(input({ checkIn: SAT, checkOut: SUN, rateCard }));

    expect(result.baseAccommodationTotal).toBe(baht(13000));
    expect(result.markupTotal).toBe(baht(2000));
    // 10% of 13,000, not of 15,000. The markup is already the agent's margin.
    expect(result.commission.amount).toBe(baht(1300));
  });

  it('keeps the damage deposit out of commission', () => {
    const rateCard = makeAgentRateCard({ commissionRate: 1 });
    const result = quote(input({ checkIn: SAT, checkOut: SUN, rateCard }));
    expect(result.commission.amount).toBe(result.baseAccommodationTotal);
  });

  it('adds up: subtotal is accommodation plus extras plus add-ons', () => {
    const result = quote(
      input({
        checkIn: FRI,
        checkOut: SUN,
        guests: guests(23),
        addOns: [
          { key: 'ice', label: 'Ice', qty: 4, unitPrice: baht(50) },
          { key: 'charcoal', label: 'Charcoal', qty: 3, unitPrice: baht(20) },
        ],
      }),
    );

    expect(result.addOnTotal).toBe(baht(4 * 50 + 3 * 20));
    expect(result.subtotal).toBe(
      result.accommodationTotal + result.extraGuestTotal + result.addOnTotal,
    );
    expect(result.grandTotal).toBe(result.subtotal - result.discount.amount);
  });
});

describe('promotions', () => {
  it('applies a percentage discount to the subtotal', () => {
    const result = quote(
      input({
        checkIn: FRI,
        checkOut: SUN,
        promotion: { code: 'SAVE10', kind: 'percent', value: 10, appliesTo: 'subtotal' },
      }),
    );
    expect(result.discount).toEqual({ code: 'SAVE10', amount: baht(2400) });
    expect(result.grandTotal).toBe(baht(21600));
  });

  it('rounds a fractional discount without breaking the totals', () => {
    const result = quote(
      input({
        checkIn: FRI,
        checkOut: SAT,
        promotion: { code: 'ODD', kind: 'percent', value: 7.5, appliesTo: 'subtotal' },
      }),
    );
    // 7.5% of 11,000 is exactly 825 baht in integer satang.
    expect(result.discount.amount).toBe(baht(825));
    expect(result.depositRequired + result.balanceDue).toBe(result.grandTotal);
  });

  it('respects a maximum discount cap', () => {
    const result = quote(
      input({
        checkIn: FRI,
        checkOut: SUN,
        promotion: {
          code: 'CAPPED',
          kind: 'percent',
          value: 50,
          appliesTo: 'subtotal',
          maxDiscount: baht(1000),
        },
      }),
    );
    expect(result.discount.amount).toBe(baht(1000));
  });

  it('never discounts more than is owed', () => {
    const result = quote(
      input({
        checkIn: FRI,
        checkOut: SAT,
        promotion: { code: 'HUGE', kind: 'fixed', value: baht(999999), appliesTo: 'subtotal' },
      }),
    );
    expect(result.grandTotal).toBe(baht(0));
    expect(result.discount.amount).toBe(result.subtotal);
  });

  it('explains an unmet condition instead of applying the code', () => {
    const result = quote(
      input({
        checkIn: FRI,
        checkOut: SAT,
        promotion: {
          code: 'LONGSTAY',
          kind: 'percent',
          value: 20,
          appliesTo: 'subtotal',
          minNights: 3,
        },
      }),
    );

    expect(result.discount).toEqual({ code: null, amount: baht(0) });
    expect(result.violations[0]).toMatchObject({
      code: 'PROMO_MIN_NIGHTS',
      meta: { code: 'LONGSTAY', required: 3, actual: 1 },
    });
  });

  it('discounts only accommodation when the code says so', () => {
    const result = quote(
      input({
        checkIn: FRI,
        checkOut: SAT,
        guests: guests(23),
        promotion: { code: 'ROOMONLY', kind: 'percent', value: 10, appliesTo: 'accommodation' },
      }),
    );
    // 10% of 11,000, ignoring the 600 baht of extra-guest charges.
    expect(result.discount.amount).toBe(baht(1100));
  });
});

describe('the DV-2685 golden case', () => {
  it('prices a real Songkran booking end to end', () => {
    const rateCard = makeAgentRateCard({
      commissionRate: 0.1,
      baseOverrides: [
        makeOverride({
          id: 'songkran-2026',
          startDate: SONGKRAN_EVE,
          endDate: SONGKRAN_3,
          dayTypes: ['ALL'],
          price: baht(22000),
          minNights: 3,
        }),
      ],
    });

    const result = quote({
      checkIn: SONGKRAN_EVE,
      checkOut: SONGKRAN_OUT,
      rateCard,
      capacity: CAPACITY,
      holidays: SONGKRAN_HOLIDAYS,
      guests: guests(24, 3, 3),
      addOns: [
        { key: 'ice', label: 'Ice', qty: 6, unitPrice: baht(50) },
        { key: 'charcoal', label: 'Charcoal', qty: 4, unitPrice: baht(20) },
      ],
      promotion: { code: 'SONGKRAN10', kind: 'percent', value: 10, appliesTo: 'accommodation' },
      settings: SETTINGS,
    });

    // 4 nights, all inside the override window, all holiday day type.
    expect(result.nights).toBe(4);
    expect(result.lines.every((l) => l.baseRule === 'OVERRIDE')).toBe(true);
    expect(result.lines.every((l) => l.dayType === 'HOLIDAY')).toBe(true);

    expect(result.baseAccommodationTotal).toBe(baht(22000 * 4));
    expect(result.markupTotal).toBe(baht(3000 * 4));
    expect(result.accommodationTotal).toBe(baht(100000));

    // 24 adults + 3 children, 3 of them under ten and free: 24 chargeable,
    // 4 over the base capacity of 20.
    expect(result.guests.freeChildrenApplied).toBe(3);
    expect(result.guests.extraGuests).toBe(4);
    expect(result.extraGuestTotal).toBe(baht(200 * 4 * 4));

    expect(result.addOnTotal).toBe(baht(380));
    expect(result.subtotal).toBe(baht(100000 + 3200 + 380));
    expect(result.discount.amount).toBe(baht(10000));
    expect(result.grandTotal).toBe(baht(93580));

    expect(result.damageDeposit).toBe(baht(3000));
    expect(result.depositRequired).toBe(baht(28074));
    expect(result.balanceDue).toBe(baht(65506));

    // 10% of (88,000 base minus the 10,000 discount).
    expect(result.commission.amount).toBe(baht(7800));

    expect(result.minNights).toEqual({ value: 3, source: 'override:songkran-2026' });
    expect(result.isBookable).toBe(true);
  });
});
