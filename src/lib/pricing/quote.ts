import { nightsBetween } from './dates';
import { resolveGuests } from './guests';
import { add, multiply, percentOf, subtract, ZERO } from './money';
import { appliedOverrides } from './overrides';
import { applyPromotion } from './promotions';
import { resolveNights } from './rates';
import type {
  NightLine,
  PriceQuote,
  QuoteInput,
  QuoteViolation,
  RateCard,
  Satang,
} from './types';

/**
 * The single entry point for every price in the product.
 *
 * It does no I/O, so a search page can call it twenty times after one batch of
 * queries. It also does not THROW on a business-rule failure: a stay that is
 * one night short of the festival minimum still comes back fully priced, with
 * a violation attached, so the page can say "this period needs 3 nights, which
 * would come to ฿X" instead of an empty error state.
 *
 * Only structurally impossible input throws: a checkout on or before check-in,
 * or a malformed date.
 */
export function quote(input: QuoteInput): PriceQuote {
  const { checkIn, checkOut, rateCard, capacity, holidays, guests, settings } = input;

  const nights = nightsBetween(checkIn, checkOut);
  if (nights <= 0) {
    throw new RangeError(
      `Check-out must be after check-in: got ${checkIn} to ${checkOut} (${nights} nights)`,
    );
  }

  const lines = resolveNights(checkIn, checkOut, rateCard, holidays);

  const baseAccommodationTotal = sum(lines, (line) => line.basePrice);
  const markupTotal = sum(lines, (line) => line.markup);
  const accommodationTotal = add(baseAccommodationTotal, markupTotal);

  const resolvedGuests = resolveGuests(guests, capacity);
  const extraGuestTotal = multiply(rateCard.extraGuestFee, resolvedGuests.extraGuests * nights);

  const addOns = (input.addOns ?? []).map((addOn) => ({
    ...addOn,
    total: multiply(addOn.unitPrice, addOn.qty),
  }));
  const addOnTotal = sum(addOns, (addOn) => addOn.total);

  const subtotal = add(accommodationTotal, extraGuestTotal, addOnTotal);

  const discount = applyPromotion(input.promotion, {
    accommodation: accommodationTotal,
    subtotal,
    nights,
  });

  const grandTotal = subtract(subtotal, discount.amount);

  // The damage deposit is held, not earned. It stays out of grandTotal, out of
  // commission and out of every revenue figure, and is returned at check-out.
  const damageDeposit = rateCard.damageDeposit;

  const depositPercent = rateCard.depositPercent ?? settings.depositPercent;
  const depositRequired = percentOf(grandTotal, depositPercent);
  const balanceDue = subtract(grandTotal, depositRequired);

  // Commission is calculated on the company's own share. The markup is the
  // agent's margin and is already theirs; paying commission on it would pay
  // them twice for the same night.
  const commissionBase = subtract(baseAccommodationTotal, discount.amount);
  const commissionAmount = multiply(
    (commissionBase > 0 ? commissionBase : ZERO) as Satang,
    rateCard.commissionRate,
  );

  const minNights = effectiveMinNights(lines, rateCard);

  const violations: QuoteViolation[] = [...discount.violations];

  if (nights < minNights.value) {
    violations.push({
      code: 'MIN_NIGHTS',
      meta: { required: minNights.value, actual: nights, source: minNights.source },
    });
  }

  if (resolvedGuests.overCapacityBy > 0) {
    violations.push({
      code: 'OVER_CAPACITY',
      meta: {
        by: resolvedGuests.overCapacityBy,
        maximum: capacity.baseGuests + capacity.maxExtraGuests,
        chargeable: resolvedGuests.chargeableGuests,
      },
    });
  }

  return {
    engineVersion: 'v1',
    checkIn,
    checkOut,
    nights,
    lines,
    guests: resolvedGuests,
    accommodationTotal,
    baseAccommodationTotal,
    markupTotal,
    extraGuestTotal,
    addOns,
    addOnTotal,
    subtotal,
    discount: { code: discount.code, amount: discount.amount },
    grandTotal,
    damageDeposit,
    depositRequired,
    balanceDue,
    commission: { rate: rateCard.commissionRate, amount: commissionAmount },
    minNights,
    currency: settings.currency,
    violations,
    isBookable: violations.length === 0,
  };
}

/**
 * The minimum-nights rule in force for this stay.
 *
 * It is the largest minimum among the rate card's own and every override that
 * actually PRICES one of these nights. An override whose dates overlap the
 * stay but whose day-type filter excludes every night of it does not apply,
 * and so cannot impose its minimum.
 *
 * The source is reported so the page can say "Songkran needs 3 nights" rather
 * than an unattributed number the guest cannot argue with.
 */
export function effectiveMinNights(
  lines: readonly NightLine[],
  rateCard: RateCard,
): { value: number; source: string } {
  let value = rateCard.minNights;
  let source = 'rateCard';

  const nightKeys = lines.map((line) => ({ date: line.date, dayType: line.dayType }));
  const relevant = [
    ...appliedOverrides(nightKeys, rateCard.baseOverrides),
    ...appliedOverrides(nightKeys, rateCard.markupOverrides),
  ];

  for (const override of relevant) {
    if (override.minNights !== undefined && override.minNights > value) {
      value = override.minNights;
      source = `override:${override.id}`;
    }
  }

  return { value, source };
}

function sum<T>(items: readonly T[], pick: (item: T) => Satang): Satang {
  let total = 0;
  for (const item of items) total += pick(item);
  return total as Satang;
}
