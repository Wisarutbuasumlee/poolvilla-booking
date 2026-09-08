import { cache } from 'react';
import { z } from 'zod';
import { connectToDatabase } from '@/lib/db/connect';
import { VillaModel } from '@/lib/db/models/villa';
import { getBlockedVillaIds } from '@/lib/availability/service';
import {
  fromPrice,
  getHolidaySet,
  getRateCards,
  villaCapacity,
  type VillaRateSource,
} from '@/lib/rates/rate-cards';
import { getPricingContext } from '@/lib/rates/context';
import { asDateKey, isDateKey, quote, todayBangkok, type DateKey } from '@/lib/pricing';
import { AMENITIES } from '@/lib/villas/constants';
import type { VillaCardData } from '@/components/public/villa-card';

/**
 * Reads for the public site.
 *
 * The search page is the performance-critical one. It issues four queries for
 * a page of twenty villas and then prices all of them in memory, because the
 * engine is pure and the rate cards are batched.
 */

const PAGE_SIZE = 24;

export const SearchFiltersSchema = z.object({
  zone: z.string().trim().max(60).optional(),
  checkIn: z.string().refine(isDateKey).optional(),
  checkOut: z.string().refine(isDateKey).optional(),
  guests: z.coerce.number().int().min(1).max(60).optional(),
  bedrooms: z.coerce.number().int().min(1).max(20).optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  amenities: z
    .union([z.string(), z.array(z.string())])
    .transform((value) => (Array.isArray(value) ? value : [value]))
    .pipe(z.array(z.enum(AMENITIES)))
    .optional(),
  sort: z.enum(['price_asc', 'price_desc', 'popular', 'newest']).default('popular'),
  page: z.coerce.number().int().min(1).max(200).default(1),
});

export type SearchFilters = z.output<typeof SearchFiltersSchema>;

/** Parses whatever is in the URL, dropping anything invalid rather than failing. */
export function parseSearchFilters(raw: Record<string, string | string[] | undefined>): SearchFilters {
  const parsed = SearchFiltersSchema.safeParse(raw);
  const filters = parsed.success ? parsed.data : SearchFiltersSchema.parse({});

  // A reversed or same-day range would price as zero nights. Treat it as no
  // dates chosen rather than showing an error for a slip nobody meant.
  if (filters.checkIn && filters.checkOut && filters.checkOut <= filters.checkIn) {
    return { ...filters, checkIn: undefined, checkOut: undefined };
  }
  return filters;
}

export interface SearchResult {
  cards: VillaCardData[];
  total: number;
  pages: number;
  hasDates: boolean;
}

export async function searchVillas(filters: SearchFilters): Promise<SearchResult> {
  await connectToDatabase();

  const query: Record<string, unknown> = { status: 'published' };
  if (filters.zone) query['location.zone'] = filters.zone;
  if (filters.bedrooms) query['capacity.bedrooms'] = { $gte: filters.bedrooms };
  if (filters.guests) {
    // A party of 20 fits a villa that sleeps 14 plus 8 extra. Filtering on
    // baseGuests alone would hide most of the houses that can take them.
    query.$expr = {
      $gte: [{ $add: ['$capacity.baseGuests', '$capacity.maxExtraGuests'] }, filters.guests],
    };
  }
  if (filters.amenities?.length) query.amenities = { $all: filters.amenities };

  const sort: Record<string, 1 | -1> =
    filters.sort === 'price_asc'
      ? { 'basePricing.sunThu': 1 }
      : filters.sort === 'price_desc'
        ? { 'basePricing.sunThu': -1 }
        : filters.sort === 'newest'
          ? { createdAt: -1 }
          : { 'stats.bookingCount': -1 };

  const [villas, total] = await Promise.all([
    VillaModel.find(query)
      .sort(sort)
      .skip((filters.page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean(),
    VillaModel.countDocuments(query),
  ]);

  const hasDates = Boolean(filters.checkIn && filters.checkOut);
  const context = await getPricingContext();

  const [cards, holidays, blocked] = await Promise.all([
    getRateCards(villas as unknown as VillaRateSource[], context),
    hasDates ? getHolidaySet(filters.checkIn, filters.checkOut) : getHolidaySet(),
    hasDates
      ? getBlockedVillaIds(
          villas.map((villa) => villa._id),
          filters.checkIn!,
          filters.checkOut!,
        )
      : new Set<string>(),
  ]);

  // From here on there is no I/O at all: twenty quote() calls on plain data.
  const result: VillaCardData[] = [];

  for (const villa of villas) {
    const id = villa._id.toString();
    if (blocked.has(id)) continue;

    const card = cards.get(id);
    if (!card) continue;

    const cover = villa.images?.find((image) => image.isCover) ?? villa.images?.[0];

    let price = fromPrice(card);
    let priceIsTotal = false;
    let nights = 0;

    if (hasDates) {
      const priced = quote({
        checkIn: filters.checkIn!,
        checkOut: filters.checkOut!,
        rateCard: card,
        capacity: villaCapacity(villa as unknown as VillaRateSource),
        holidays,
        guests: {
          adults: filters.guests ?? villa.capacity?.baseGuests ?? 1,
          children: 0,
          childrenUnder10: 0,
        },
        settings: { depositPercent: 30, currency: 'THB' },
      });

      // A stay that breaks the minimum still shows its total. Hiding the villa
      // would leave the guest wondering where it went.
      price = priced.grandTotal;
      priceIsTotal = true;
      nights = priced.nights;
    }

    if (filters.minPrice !== undefined && price < filters.minPrice * 100) continue;
    if (filters.maxPrice !== undefined && price > filters.maxPrice * 100) continue;

    result.push({
      code: villa.code,
      name: villa.name?.th ?? villa.code,
      zone: villa.location?.zone ?? '',
      bedrooms: villa.capacity?.bedrooms ?? 0,
      bathrooms: villa.capacity?.bathrooms ?? 0,
      baseGuests: villa.capacity?.baseGuests ?? 0,
      hasSlider: Boolean(villa.pool?.hasSlider),
      distanceToBeachKm: villa.location?.distanceToBeachKm ?? null,
      coverUrl: cover?.thumbUrl ?? cover?.url ?? null,
      coverIsSynthetic: Boolean(cover?.isSynthetic),
      price,
      priceIsTotal,
      nights,
    });
  }

  return { cards: result, total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), hasDates };
}

/** Featured villas for the home page. */
export async function getFeaturedVillas(limit = 8): Promise<VillaCardData[]> {
  const { cards } = await searchVillas({
    sort: 'popular',
    page: 1,
  } as SearchFilters);
  return cards.slice(0, limit);
}

/** Zones that actually have published villas. */
export const getPublicZones = cache(async (): Promise<string[]> => {
  await connectToDatabase();
  const zones = await VillaModel.distinct('location.zone', { status: 'published' });
  return zones.filter(Boolean).sort();
});

/** One villa by its public code. */
export const getVillaByCode = cache(async (code: string) => {
  await connectToDatabase();
  return VillaModel.findOne({ code: code.toUpperCase(), status: 'published' }).lean();
});

/** Two months of availability from a starting month, for the villa calendar. */
export function calendarRange(from?: DateKey): { start: DateKey; end: DateKey } {
  const start = from ?? asDateKey(`${todayBangkok().slice(0, 7)}-01`);
  const [year, month] = start.split('-').map(Number) as [number, number];
  // The last day of the following month, so two full months are covered.
  const end = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
  return { start, end: asDateKey(end) };
}
