import { asDateKey } from '../dates';
import { baht } from '../money';
import type {
  DateKey,
  DayRates,
  GuestCounts,
  PriceOverride,
  QuoteSettings,
  RateCard,
  VillaCapacity,
} from '../types';

/**
 * Shared test material.
 *
 * Weekday anchors used throughout, all real 2026 dates:
 *
 *   2026-03-04  Wed      2026-03-07  Sat
 *   2026-03-05  Thu      2026-03-08  Sun
 *   2026-03-06  Fri      2026-03-09  Mon
 *
 *   Songkran 2026: 13-15 April (Mon, Tue, Wed), eve Sunday 12 April
 *   Leap day:      2028-02-29 (Tue)
 */

export const d = asDateKey;

export const WED = d('2026-03-04');
export const THU = d('2026-03-05');
export const FRI = d('2026-03-06');
export const SAT = d('2026-03-07');
export const SUN = d('2026-03-08');
export const MON = d('2026-03-09');

export const SONGKRAN_EVE = d('2026-04-12');
export const SONGKRAN_1 = d('2026-04-13');
export const SONGKRAN_2 = d('2026-04-14');
export const SONGKRAN_3 = d('2026-04-15');
export const SONGKRAN_OUT = d('2026-04-16');

export const SONGKRAN_HOLIDAYS: ReadonlySet<DateKey> = new Set([
  SONGKRAN_EVE,
  SONGKRAN_1,
  SONGKRAN_2,
  SONGKRAN_3,
]);

export const NO_HOLIDAYS: ReadonlySet<DateKey> = new Set<DateKey>();

/** DV-2685 shaped rates: the company's own nightly prices. */
export const BASE_RATES: DayRates = {
  sunThu: baht(9000),
  fri: baht(11000),
  sat: baht(13000),
  holiday: baht(15000),
};

/** What agent 123 adds on top. */
export const MARKUP_RATES: DayRates = {
  sunThu: baht(1000),
  fri: baht(1500),
  sat: baht(2000),
  holiday: baht(3000),
};

export const NO_MARKUP: DayRates = {
  sunThu: baht(0),
  fri: baht(0),
  sat: baht(0),
  holiday: baht(0),
};

/** DV-2685: 5 bedrooms, sleeps 20, up to 15 extra, 5 under-10s free. */
export const CAPACITY: VillaCapacity = {
  baseGuests: 20,
  maxExtraGuests: 15,
  freeChildUnder10Quota: 5,
};

export const SETTINGS: QuoteSettings = {
  depositPercent: 30,
  currency: 'THB',
};

export function makeRateCard(overrides: Partial<RateCard> = {}): RateCard {
  return {
    villaId: 'villa-dv-2685',
    agentId: null,
    agentCode: null,
    source: 'base_price',
    base: BASE_RATES,
    baseOverrides: [],
    markup: NO_MARKUP,
    markupOverrides: [],
    minNights: 1,
    extraGuestFee: baht(200),
    damageDeposit: baht(3000),
    commissionRate: 0,
    ...overrides,
  };
}

/** A rate card as agent 123 sees it. */
export function makeAgentRateCard(overrides: Partial<RateCard> = {}): RateCard {
  return makeRateCard({
    agentId: 'agent-123',
    agentCode: '123',
    source: 'agent',
    markup: MARKUP_RATES,
    ...overrides,
  });
}

export function makeOverride(overrides: Partial<PriceOverride> & { id: string }): PriceOverride {
  return {
    startDate: SONGKRAN_1,
    endDate: SONGKRAN_3,
    dayTypes: ['ALL'],
    price: baht(20000),
    ...overrides,
  };
}

export function guests(
  adults: number,
  children = 0,
  childrenUnder10 = 0,
): GuestCounts {
  return { adults, children, childrenUnder10 };
}
