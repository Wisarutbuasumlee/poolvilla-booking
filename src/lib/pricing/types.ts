/**
 * Pricing engine types.
 *
 * This module imports nothing. Everything the engine needs arrives as an
 * argument, which is what lets a search page price twenty villas with no
 * additional database work.
 */

// ---------------------------------------------------------------------------
// Branded primitives
// ---------------------------------------------------------------------------

/**
 * A civil date in Asia/Bangkok, 'YYYY-MM-DD'.
 *
 * The ONLY date type inside the engine. A Date is an instant, and an instant
 * read with local accessors gives a different calendar day on a UTC server
 * than on a Bangkok laptop. See docs/DECISIONS.md D-002.
 */
export type DateKey = string & { readonly __brand: 'DateKey' };

/**
 * Money as an integer number of satang. ฿12,500 is 1_250_000.
 *
 * A 7.5% discount on ฿12,500 is exactly 93750 satang. In baht floats it is
 * 937.4999999999999, and that error compounds across nights until a booking
 * total is off by a satang and the accounting does not reconcile.
 */
export type Satang = number & { readonly __brand: 'Satang' };

/** 0 = Sunday, matching Date.prototype.getUTCDay. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// ---------------------------------------------------------------------------
// Day types and rates
// ---------------------------------------------------------------------------

export type DayType = 'SUN_THU' | 'FRI' | 'SAT' | 'HOLIDAY';

/** Overrides may target specific day types, or every night in their range. */
export type OverrideDayType = DayType | 'ALL';

export interface DayRates {
  sunThu: Satang;
  fri: Satang;
  sat: Satang;
  holiday: Satang;
}

export interface LocalizedText {
  th: string;
  en?: string;
  zh?: string;
}

/**
 * A dated price rule. Used for both layers:
 *
 *   - on the villa, `price` is the company's nightly rate for that period
 *   - on the villa-agent link, `price` is the agent's markup for that period
 *
 * Both are selected by the same algorithm, so a festival window behaves
 * identically whichever layer declared it.
 */
export interface PriceOverride {
  /** Stable id (the subdocument _id). Needed for the tie-break and the audit trail. */
  id: string;
  label?: LocalizedText;
  /** Inclusive. */
  startDate: DateKey;
  /** Inclusive, and counted in NIGHTS, not checkout dates. */
  endDate: DateKey;
  dayTypes: readonly OverrideDayType[];
  price: Satang;
  minNights?: number;
}

/**
 * Everything needed to price one villa for one agent, already resolved.
 *
 * The two layers are deliberately separate rather than pre-summed. The company
 * raises `base` without touching any agent, and a booking can still report how
 * much of each night belonged to whom. See docs/DECISIONS.md D-001.
 */
export interface RateCard {
  villaId: string;
  /** null when no agent referral applies, in which case markup is all zeroes. */
  agentId: string | null;
  agentCode: string | null;
  /** Where the displayed price came from. Used by the UI and asserted at booking time. */
  source: 'agent' | 'primary_agent' | 'lowest' | 'base_price';

  /** The company's own nightly rates. Bookable on their own. */
  base: DayRates;
  baseOverrides: readonly PriceOverride[];

  /** What this agent adds per night, by day type. All zeroes when agentId is null. */
  markup: DayRates;
  markupOverrides: readonly PriceOverride[];

  minNights: number;
  extraGuestFee: Satang;
  damageDeposit: Satang;
  /** 0..1. Calculated on the base portion; the markup is the agent's own margin. */
  commissionRate: number;
  /** Overrides the global default when set. */
  depositPercent?: number;
}

// ---------------------------------------------------------------------------
// Villa and guests
// ---------------------------------------------------------------------------

export interface VillaCapacity {
  baseGuests: number;
  maxExtraGuests: number;
  /** How many under-10s sleep free with a guardian. */
  freeChildUnder10Quota: number;
}

export interface GuestCounts {
  adults: number;
  /** All children, including the under-10s. */
  children: number;
  /** Subset of `children`. */
  childrenUnder10: number;
}

export interface SelectedAddOn {
  key: string;
  label: string;
  qty: number;
  unitPrice: Satang;
}

// ---------------------------------------------------------------------------
// Promotions
// ---------------------------------------------------------------------------

export type Promotion =
  | {
      code: string;
      kind: 'percent';
      /** 0..100. */
      value: number;
      appliesTo: 'accommodation' | 'subtotal';
      maxDiscount?: Satang;
      minNights?: number;
      minSubtotal?: Satang;
    }
  | {
      code: string;
      kind: 'fixed';
      value: Satang;
      appliesTo: 'subtotal';
      minNights?: number;
      minSubtotal?: Satang;
    };

// ---------------------------------------------------------------------------
// Input and output
// ---------------------------------------------------------------------------

export interface QuoteSettings {
  /** 0..100. A villa's own depositPercent wins over this. */
  depositPercent: number;
  currency: 'THB';
}

export interface QuoteInput {
  checkIn: DateKey;
  /** Exclusive. Nights are [checkIn, checkOut). */
  checkOut: DateKey;
  rateCard: RateCard;
  capacity: VillaCapacity;
  /**
   * Every date priced as a holiday, already materialised. Long-weekend eves
   * are real rows in the holidays collection, not something the engine infers,
   * so a disputed bill can be traced to a record an admin can show.
   */
  holidays: ReadonlySet<DateKey>;
  guests: GuestCounts;
  addOns?: readonly SelectedAddOn[];
  promotion?: Promotion | null;
  settings: QuoteSettings;
}

export type PriceRule = 'OVERRIDE' | 'HOLIDAY' | 'SAT' | 'FRI' | 'SUN_THU';

export interface NightLine {
  date: DateKey;
  weekday: Weekday;
  /** The night's day type BEFORE any override is applied. */
  dayType: DayType;

  basePrice: Satang;
  baseRule: PriceRule;
  baseOverrideId?: string;

  markup: Satang;
  markupRule: PriceRule;
  markupOverrideId?: string;

  /** basePrice + markup. What the guest pays for this night. */
  price: Satang;
}

export type ViolationCode =
  | 'MIN_NIGHTS'
  | 'OVER_CAPACITY'
  | 'PROMO_MIN_NIGHTS'
  | 'PROMO_MIN_SUBTOTAL';

export interface QuoteViolation {
  code: ViolationCode;
  /** Machine-readable detail. The UI turns this into a translated sentence. */
  meta: Record<string, number | string>;
}

export interface ResolvedGuests {
  total: number;
  freeChildrenApplied: number;
  chargeableGuests: number;
  extraGuests: number;
  overCapacityBy: number;
}

export interface PriceQuote {
  engineVersion: 'v1';
  checkIn: DateKey;
  checkOut: DateKey;
  nights: number;
  lines: readonly NightLine[];

  guests: ResolvedGuests;

  accommodationTotal: Satang;
  /** The company's share of accommodation, before any agent markup. */
  baseAccommodationTotal: Satang;
  /** The agent's share of accommodation. */
  markupTotal: Satang;

  extraGuestTotal: Satang;
  addOns: readonly (SelectedAddOn & { total: Satang })[];
  addOnTotal: Satang;

  subtotal: Satang;
  discount: { code: string | null; amount: Satang };
  /** subtotal - discount. EXCLUDES the damage deposit. */
  grandTotal: Satang;

  /** Held separately and refunded at check-out. Never revenue, never commission. */
  damageDeposit: Satang;
  depositRequired: Satang;
  balanceDue: Satang;

  commission: { rate: number; amount: Satang };

  /** For the villa detail page's rate table. */
  minNights: { value: number; source: string };

  currency: 'THB';
  violations: readonly QuoteViolation[];
  /** True when nothing blocks this booking. */
  isBookable: boolean;
}
