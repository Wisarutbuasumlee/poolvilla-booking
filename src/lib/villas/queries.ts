import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/db/connect';
import { VillaModel } from '@/lib/db/models/villa';
import { VillaAgentModel } from '@/lib/db/models/villa-agent';
import { villaScopeFilter, type Actor } from '@/lib/auth/rbac';
import type { VillaListFilters } from '@/lib/validation/villa';

/**
 * Reads for the back-office villa screens.
 *
 * Every function here takes the actor and scopes to what they may see. An
 * unscoped villa query does not exist in this module on purpose: the scoping
 * cannot be forgotten if there is nothing to forget it on.
 */

const PAGE_SIZE = 20;

export interface VillaListRow {
  id: string;
  code: string;
  name: string;
  zone: string;
  status: 'draft' | 'published' | 'hidden';
  bedrooms: number;
  baseGuests: number;
  satRate: number;
  coverUrl: string | null;
  agentCount: number;
  bookingCount: number;
}

export async function listVillas(
  actor: Actor,
  filters: VillaListFilters,
): Promise<{ rows: VillaListRow[]; total: number; pages: number }> {
  await connectToDatabase();

  const scope = await villaScopeFilter(actor);
  const query: Record<string, unknown> = { ...scope };

  if (filters.status) query.status = filters.status;
  if (filters.zone) query['location.zone'] = filters.zone;
  if (filters.q) {
    // Code first: staff search by code far more often than by name, and an
    // exact code should never be buried under a fuzzy name match.
    query.$or = [
      { code: new RegExp(escapeRegex(filters.q), 'i') },
      { 'name.th': new RegExp(escapeRegex(filters.q), 'i') },
      { 'name.en': new RegExp(escapeRegex(filters.q), 'i') },
    ];
  }

  const [docs, total] = await Promise.all([
    VillaModel.find(query)
      .select({
        code: 1,
        name: 1,
        status: 1,
        'location.zone': 1,
        'capacity.bedrooms': 1,
        'capacity.baseGuests': 1,
        'basePricing.sat': 1,
        images: 1,
        'stats.bookingCount': 1,
      })
      .sort({ code: 1 })
      .skip((filters.page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean(),
    VillaModel.countDocuments(query),
  ]);

  // One aggregation for the whole page rather than a count per row, which
  // would be twenty extra queries on a twenty-row table.
  const villaIds = docs.map((doc) => doc._id);
  const agentCounts = await VillaAgentModel.aggregate<{ _id: Types.ObjectId; n: number }>([
    { $match: { villaId: { $in: villaIds }, isActive: true } },
    { $group: { _id: '$villaId', n: { $sum: 1 } } },
  ]);
  const countByVilla = new Map(agentCounts.map((row) => [row._id.toString(), row.n]));

  return {
    rows: docs.map((doc) => ({
      id: doc._id.toString(),
      code: doc.code,
      name: doc.name?.th ?? doc.code,
      zone: doc.location?.zone ?? '',
      status: doc.status as VillaListRow['status'],
      bedrooms: doc.capacity?.bedrooms ?? 0,
      baseGuests: doc.capacity?.baseGuests ?? 0,
      satRate: doc.basePricing?.sat ?? 0,
      coverUrl: doc.images?.find((image) => image.isCover)?.url ?? doc.images?.[0]?.url ?? null,
      agentCount: countByVilla.get(doc._id.toString()) ?? 0,
      bookingCount: doc.stats?.bookingCount ?? 0,
    })),
    total,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/** One villa, or null when it does not exist or is out of this actor's scope. */
export async function getVillaForEdit(actor: Actor, id: string) {
  await connectToDatabase();
  if (!Types.ObjectId.isValid(id)) return null;

  const scope = await villaScopeFilter(actor);
  return VillaModel.findOne({ _id: new Types.ObjectId(id), ...scope }).lean();
}

/** Zones that exist, for the filter dropdown. Cheap and always accurate. */
export async function listZones(actor: Actor): Promise<string[]> {
  await connectToDatabase();
  const scope = await villaScopeFilter(actor);
  const zones = await VillaModel.distinct('location.zone', scope);
  return zones.filter(Boolean).sort();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
