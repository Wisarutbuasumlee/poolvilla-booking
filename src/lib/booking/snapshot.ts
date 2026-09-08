import type { PriceQuote, RateCard } from '@/lib/pricing';

/**
 * Freezes a quote into the shape a booking document stores.
 *
 * Agent markups and company base rates change; a booking must not. Everything
 * needed to reproduce and defend the total is written down here, so a dispute
 * six months later is answered from the booking alone and re-running the
 * engine on the snapshot gives back the same number to the satang.
 *
 * Every report reads these figures. None of them join back to villa_agents,
 * which would restate history every time somebody edited a rate.
 */

export function serialiseQuote(quote: PriceQuote) {
  return {
    nights: quote.lines.map((line) => ({
      dateKey: line.date,
      dayType: line.dayType,
      // Kept apart so a payout run can tell the company's money from the
      // agent's without recomputing anything.
      basePrice: line.basePrice,
      markup: line.markup,
      price: line.price,
      baseRule: line.baseRule,
      markupRule: line.markupRule,
      ...(line.baseOverrideId ? { baseOverrideId: line.baseOverrideId } : {}),
      ...(line.markupOverrideId ? { markupOverrideId: line.markupOverrideId } : {}),
    })),

    accommodationTotal: quote.accommodationTotal,
    baseAccommodationTotal: quote.baseAccommodationTotal,
    markupTotal: quote.markupTotal,
    extraGuestTotal: quote.extraGuestTotal,
    addOns: quote.addOns.map((addOn) => ({
      key: addOn.key,
      label: addOn.label,
      qty: addOn.qty,
      unitPrice: addOn.unitPrice,
      total: addOn.total,
    })),
    addOnTotal: quote.addOnTotal,
    subtotal: quote.subtotal,
    discount: { code: quote.discount.code, amount: quote.discount.amount },
    grandTotal: quote.grandTotal,

    // Held, not earned. Excluded from grandTotal, from commission and from
    // every revenue figure, and returned at check-out.
    damageDeposit: quote.damageDeposit,
    depositRequired: quote.depositRequired,
    balanceDue: quote.balanceDue,
    currency: quote.currency,
  };
}

/**
 * The resolved rate card, so the quote can be reproduced exactly.
 *
 * The arrays are copied rather than passed through. The engine's types are
 * readonly, which is right for a pure module, but Mongoose writes into what it
 * is given, and handing it a frozen array is a runtime failure waiting for the
 * one code path that mutates.
 */
export function serialiseRateCard(card: RateCard) {
  return {
    base: { ...card.base },
    baseOverrides: card.baseOverrides.map(copyOverride),
    markup: { ...card.markup },
    markupOverrides: card.markupOverrides.map(copyOverride),
    extraGuestFee: card.extraGuestFee,
    minNights: card.minNights,
    source: card.source,
  };
}

function copyOverride(override: RateCard['baseOverrides'][number]) {
  return {
    startDate: override.startDate,
    endDate: override.endDate,
    dayTypes: [...override.dayTypes],
    price: override.price,
    ...(override.minNights === undefined ? {} : { minNights: override.minNights }),
    ...(override.label ? { label: { ...override.label } } : {}),
  };
}
