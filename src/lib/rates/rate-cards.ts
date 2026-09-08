import { cache } from 'react';
import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/db/connect';
import { HolidayModel } from '@/lib/db/models/reference';
import { VillaAgentModel } from '@/lib/db/models/villa-agent';
import {
  asDateKey,
  type DateKey,
  type DayRates,
  type PriceOverride,
  type RateCard,
  type VillaCapacity,
} from '@/lib/pricing';
import type { PricingContext } from './context';

/**
 * Turns villas plus a referral into rate cards, in ONE query for the page.
 *
 * This is the piece that keeps the search page cheap. Twenty villa cards need
 * twenty prices; naively that is twenty lookups of the villa-agent link and
 * twenty of the holidays. Batching both here means the page issues two
 * queries and then calls the pure engine twenty times in memory.
 */

const ZERO_MARKUP: DayRates = { sunThu: 0, fri: 0, sat: 0, holiday: 0 } as DayRates;

/**
 * The villa fields a rate card is built from, in the shape Mongoose returns.
 *
 * Deliberately plain numbers and nullable fields rather than the engine's
 * branded types. This interface is the boundary: everything above it is
 * database output, everything the engine receives is branded and normalised,
 * and the conversion happens in exactly one place below.
 */
export interface VillaRateSource {
  _id: Types.ObjectId;
  basePricing: { sunThu: number; fri: number; sat: number; holiday: number };
  baseOverrides?: unknown[];
  minNights?: number | null;
  damageDeposit: number;
  capacity: {
    baseGuests: number;
    maxExtraGuests: number;
    extraGuestFee: number;
    freeChildUnder10Quota: number;
  };
  depositPercentOverride?: number | null;
}

/**
 * The capacity shape the engine expects, with the defaults a villa document
 * might be missing. A villa with no capacity block cannot be priced at all,
 * so zeroes here would silently make every guest an extra guest.
 */
export function villaCapacity(villa: VillaRateSource): VillaCapacity {
  return {
    baseGuests: villa.capacity.baseGuests,
    maxExtraGuests: villa.capacity.maxExtraGuests,
    freeChildUnder10Quota: villa.capacity.freeChildUnder10Quota,
  };
}

export async function getRateCards(
  villas: readonly VillaRateSource[],
  context: PricingContext,
): Promise<Map<string, RateCard>> {
  if (villas.length === 0) return new Map();

  await connectToDatabase();
  const villaIds = villas.map((villa) => villa._id);

  // With no referral there is nothing to look up: the base rates are already
  // on the villa documents the page loaded. This is the common case, and it
  // costs zero extra queries.
  const links = context.agentId
    ? await VillaAgentModel.find(
        { villaId: { $in: villaIds }, agentId: context.agentId, isActive: true },
        {
          villaId: 1,
          markup: 1,
          markupOverrides: 1,
          minNightsOverride: 1,
          extraGuestFeeOverride: 1,
          damageDepositOverride: 1,
          commissionRateOverride: 1,
        },
      ).lean()
    : [];

  const linkByVilla = new Map(links.map((link) => [link.villaId.toString(), link]));

  const cards = new Map<string, RateCard>();

  for (const villa of villas) {
    const id = villa._id.toString();
    const link = linkByVilla.get(id);

    cards.set(id, {
      villaId: id,
      // A villa this agent does not hold falls back to the base price rather
      // than disappearing: the guest followed a link to see this house.
      agentId: link ? String(context.agentId) : null,
      agentCode: link ? context.agentCode : null,
      source: link ? 'agent' : 'base_price',

      base: villa.basePricing as DayRates,
      baseOverrides: (villa.baseOverrides ?? []) as PriceOverride[],

      markup: (link?.markup as DayRates | undefined) ?? ZERO_MARKUP,
      markupOverrides: (link?.markupOverrides as PriceOverride[] | undefined) ?? [],

      minNights: link?.minNightsOverride ?? villa.minNights ?? 1,
      extraGuestFee: (link?.extraGuestFeeOverride ??
        villa.capacity.extraGuestFee) as RateCard['extraGuestFee'],
      damageDeposit: (link?.damageDepositOverride ??
        villa.damageDeposit) as RateCard['damageDeposit'],
      commissionRate: link?.commissionRateOverride ?? 0,
      ...(villa.depositPercentOverride
        ? { depositPercent: villa.depositPercentOverride }
        : {}),
    });
  }

  return cards;
}

export async function getRateCard(
  villa: VillaRateSource,
  context: PricingContext,
): Promise<RateCard> {
  const cards = await getRateCards([villa], context);
  return cards.get(villa._id.toString())!;
}

/**
 * Every date that prices as a holiday in a range.
 *
 * Cached per request and tiny: about forty rows a year. The engine takes a Set
 * so a stay of any length costs one membership test per night.
 */
export const getHolidaySet = cache(
  async (from?: DateKey, to?: DateKey): Promise<ReadonlySet<DateKey>> => {
    await connectToDatabase();

    const query: Record<string, unknown> = { isActive: true };
    if (from && to) query.dateKey = { $gte: from, $lte: to };

    const rows = await HolidayModel.find(query, { dateKey: 1 }).lean();
    return new Set(rows.map((row) => asDateKey(row.dateKey)));
  },
);

/**
 * The lowest nightly rate a villa shows, for a card with no dates chosen.
 *
 * Deliberately the plain day-type minimum and not the cheapest night across
 * the year: a "from" price that only exists during one week in October is a
 * number the guest will never be offered.
 */
export function fromPrice(card: RateCard): number {
  return Math.min(
    card.base.sunThu + card.markup.sunThu,
    card.base.fri + card.markup.fri,
    card.base.sat + card.markup.sat,
  );
}
