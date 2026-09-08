import { clamp, percentOf, ZERO } from './money';
import type { Promotion, QuoteViolation, Satang } from './types';

export interface DiscountResult {
  code: string | null;
  amount: Satang;
  violations: QuoteViolation[];
}

/**
 * Applies a promotion, or explains why it did not apply.
 *
 * An unmet condition is reported, never thrown. A guest who typed a valid code
 * for the wrong dates deserves "this code needs 3 nights", not a red box that
 * says the code is invalid.
 */
export function applyPromotion(
  promotion: Promotion | null | undefined,
  amounts: { accommodation: Satang; subtotal: Satang; nights: number },
): DiscountResult {
  if (!promotion) return { code: null, amount: ZERO, violations: [] };

  const violations: QuoteViolation[] = [];

  if (promotion.minNights !== undefined && amounts.nights < promotion.minNights) {
    violations.push({
      code: 'PROMO_MIN_NIGHTS',
      meta: { code: promotion.code, required: promotion.minNights, actual: amounts.nights },
    });
  }

  if (promotion.minSubtotal !== undefined && amounts.subtotal < promotion.minSubtotal) {
    violations.push({
      code: 'PROMO_MIN_SUBTOTAL',
      meta: { code: promotion.code, required: promotion.minSubtotal, actual: amounts.subtotal },
    });
  }

  if (violations.length > 0) return { code: null, amount: ZERO, violations };

  const target = promotion.appliesTo === 'accommodation' ? amounts.accommodation : amounts.subtotal;

  const raw =
    promotion.kind === 'percent'
      ? percentOf(target, promotion.value, promotion.maxDiscount)
      : promotion.value;

  // A discount can never exceed what is owed, whatever the code says.
  return { code: promotion.code, amount: clamp(raw, ZERO, amounts.subtotal), violations: [] };
}
