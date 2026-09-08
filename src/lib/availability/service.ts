import { Types, type ClientSession } from 'mongoose';
import { AvailabilityModel, type AvailabilityStatus } from '@/lib/db/models/availability';
import { eachNight } from '@/lib/pricing';
import type { DateKey } from '@/lib/pricing';

/**
 * The shared villa calendar.
 *
 * ---------------------------------------------------------------------------
 * How double booking is actually prevented
 * ---------------------------------------------------------------------------
 * By the unique index on {villaId, dateKey}, and by nothing else.
 *
 * A hold fires one conditional upsert per night in a single unordered
 * bulkWrite. For each night exactly one of three things happens:
 *
 *   free            the filter matches nothing, the upsert inserts
 *   ours or expired the filter matches, the update applies
 *   somebody else's the filter matches nothing AND the insert collides with
 *                   the unique index, producing a duplicate-key error
 *
 * That third case is the load-bearing one: the index turns "another booking
 * owns this night" into a hard error the storage engine raises, rather than a
 * silent no-op that application logic would have to notice. Unordered means
 * the other nights still run, so one round trip reports every conflict.
 *
 * If we did not claim every night, we delete only our own claims, scoped by
 * bookingId, which cannot touch the winner's documents. A crash between claim
 * and compensation leaves a partial hold that expires within holdMinutes and
 * is then swept. The worst case is a villa looking busy for half an hour. It
 * is never a double booking and never lost money.
 *
 * Transactions are a safety net on top of this, not the mechanism. See
 * docs/DECISIONS.md D-003.
 */

export interface HoldRequest {
  villaId: Types.ObjectId;
  checkIn: DateKey;
  /** Exclusive. */
  checkOut: DateKey;
  holdMinutes: number;
  source: 'web' | 'agent' | 'admin';
}

export type HoldResult =
  | { ok: true; bookingId: Types.ObjectId; nights: DateKey[]; holdExpiresAt: Date }
  | { ok: false; reason: 'CONFLICT'; conflictingDates: DateKey[] }
  | { ok: false; reason: 'INVALID_RANGE' };

/** Statuses that block a night. An expired hold is not one of them. */
const BLOCKING = ['booked', 'blocked', 'maintenance'] as const;

/**
 * Claims every night of a stay, atomically enough.
 *
 * The booking id is generated FIRST and used as both the hold token and the
 * eventual booking _id. That removes a whole reconciliation step: every
 * calendar document says which booking owns it from the moment it is written.
 */
export async function holdNights(
  request: HoldRequest,
  session?: ClientSession,
): Promise<HoldResult> {
  const nights = eachNight(request.checkIn, request.checkOut);
  if (nights.length === 0) return { ok: false, reason: 'INVALID_RANGE' };

  const bookingId = new Types.ObjectId();
  const now = new Date();
  const holdExpiresAt = new Date(now.getTime() + request.holdMinutes * 60_000);

  const operations = nights.map((dateKey) => ({
    updateOne: {
      filter: {
        villaId: request.villaId,
        dateKey,
        $or: [
          { status: 'available' as const },
          // Stealing an expired hold is correct: the other party's window is
          // over, and waiting for the sweeper would block a real guest.
          { status: 'held' as const, holdExpiresAt: { $lt: now } },
        ],
      },
      update: {
        $set: {
          status: 'held' as AvailabilityStatus,
          bookingId,
          holdExpiresAt,
          source: request.source,
        },
        $setOnInsert: { villaId: request.villaId, dateKey },
      },
      upsert: true,
    },
  }));

  let claimed = 0;
  try {
    const result = await AvailabilityModel.bulkWrite(operations, {
      ordered: false,
      ...(session ? { session } : {}),
    });
    claimed = (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0);
  } catch (error) {
    // A duplicate key here is the expected shape of losing a race, not a bug.
    // Partial results live on the error.
    const partial = (error as { result?: { upsertedCount?: number; modifiedCount?: number } })
      .result;
    claimed = (partial?.upsertedCount ?? 0) + (partial?.modifiedCount ?? 0);
  }

  if (claimed === nights.length) {
    return { ok: true, bookingId, nights, holdExpiresAt };
  }

  // Compensate. Scoped by bookingId, so this can only undo our own claims.
  // deleteMany rather than setting 'available' keeps the absence-means-free
  // invariant and stops the collection growing without bound.
  await AvailabilityModel.deleteMany(
    { villaId: request.villaId, bookingId, status: 'held' },
    session ? { session } : {},
  );

  const conflictingDates = await findConflicts(request.villaId, nights, session);
  return { ok: false, reason: 'CONFLICT', conflictingDates };
}

/**
 * Which of these nights somebody else holds.
 *
 * Read after the fact rather than parsed out of the driver's write errors:
 * one extra query on the failure path only, and it does not depend on the
 * shape of a bulk error that changes between driver versions.
 */
async function findConflicts(
  villaId: Types.ObjectId,
  nights: readonly DateKey[],
  session?: ClientSession,
): Promise<DateKey[]> {
  const rows = await AvailabilityModel.find(
    {
      villaId,
      dateKey: { $in: [...nights] as string[] },
      $or: [
        { status: { $in: BLOCKING } },
        { status: 'held', holdExpiresAt: { $gt: new Date() } },
      ],
    },
    { dateKey: 1 },
    session ? { session } : {},
  ).lean();

  return rows.map((row) => row.dateKey as DateKey).sort();
}

/** Turns a live hold into a booking. Returns false if the hold is already gone. */
export async function confirmHold(
  bookingId: Types.ObjectId,
  session?: ClientSession,
): Promise<boolean> {
  const result = await AvailabilityModel.updateMany(
    { bookingId, status: 'held' },
    { $set: { status: 'booked' }, $unset: { holdExpiresAt: '' } },
    session ? { session } : {},
  );
  return result.modifiedCount > 0;
}

/** Releases a hold. Returns how many nights were freed. */
export async function releaseHold(
  bookingId: Types.ObjectId,
  session?: ClientSession,
): Promise<number> {
  const result = await AvailabilityModel.deleteMany(
    { bookingId, status: 'held' },
    session ? { session } : {},
  );
  return result.deletedCount ?? 0;
}

/**
 * The calendar for one villa over a range.
 *
 * An expired hold is reported as available. That is what makes a dead sweeper
 * a cosmetic problem rather than an outage: a stale hold never blocks a real
 * guest, it only looks untidy in the back office until something clears it.
 */
export async function getBlockedDates(
  villaId: Types.ObjectId,
  from: DateKey,
  to: DateKey,
): Promise<Map<DateKey, AvailabilityStatus>> {
  const rows = await AvailabilityModel.find(
    {
      villaId,
      dateKey: { $gte: from, $lte: to },
      $or: [
        { status: { $in: BLOCKING } },
        { status: 'held', holdExpiresAt: { $gt: new Date() } },
      ],
    },
    { dateKey: 1, status: 1 },
  ).lean();

  return new Map(rows.map((row) => [row.dateKey as DateKey, row.status as AvailabilityStatus]));
}

/**
 * Which of these villas cannot take this stay.
 *
 * One aggregation for the whole search page, so hiding unavailable villas
 * costs a single query no matter how many results are on screen.
 */
export async function getBlockedVillaIds(
  villaIds: readonly Types.ObjectId[],
  checkIn: DateKey,
  checkOut: DateKey,
): Promise<Set<string>> {
  if (villaIds.length === 0) return new Set();

  const rows = await AvailabilityModel.aggregate<{ _id: Types.ObjectId }>([
    {
      $match: {
        villaId: { $in: villaIds as Types.ObjectId[] },
        // Nights are [checkIn, checkOut): the checkout date is never held.
        dateKey: { $gte: checkIn, $lt: checkOut },
        $or: [
          { status: { $in: BLOCKING } },
          { status: 'held', holdExpiresAt: { $gt: new Date() } },
        ],
      },
    },
    { $group: { _id: '$villaId' } },
  ]);

  return new Set(rows.map((row) => row._id.toString()));
}

export interface BlockRequest {
  villaId: Types.ObjectId;
  dates: readonly DateKey[];
  status: Extract<AvailabilityStatus, 'blocked' | 'maintenance'>;
  source: 'admin' | 'agent' | 'ical';
  note?: string;
}

/**
 * Blocks dates manually.
 *
 * Refuses to touch a night that is already booked or held: taking a paid
 * booking off the calendar must be a deliberate cancellation, never a side
 * effect of dragging across a month grid.
 */
export async function blockDates(
  request: BlockRequest,
  session?: ClientSession,
): Promise<{ blocked: DateKey[]; skipped: DateKey[] }> {
  const blocked: DateKey[] = [];
  const skipped: DateKey[] = [];

  for (const dateKey of request.dates) {
    const result = await AvailabilityModel.updateOne(
      {
        villaId: request.villaId,
        dateKey,
        $or: [
          { status: { $in: ['available', 'blocked', 'maintenance'] } },
          { status: 'held', holdExpiresAt: { $lt: new Date() } },
        ],
      },
      {
        $set: {
          status: request.status,
          source: request.source,
          bookingId: null,
          ...(request.note === undefined ? {} : { note: request.note }),
        },
        $unset: { holdExpiresAt: '' },
        $setOnInsert: { villaId: request.villaId, dateKey },
      },
      { upsert: true, ...(session ? { session } : {}) },
    ).catch(() => null);

    if (result && (result.upsertedCount > 0 || result.modifiedCount > 0)) {
      blocked.push(dateKey);
    } else {
      skipped.push(dateKey);
    }
  }

  return { blocked, skipped };
}

/** Frees manually blocked dates. Never touches a booking. */
export async function unblockDates(
  villaId: Types.ObjectId,
  dates: readonly DateKey[],
  session?: ClientSession,
): Promise<number> {
  const result = await AvailabilityModel.deleteMany(
    {
      villaId,
      dateKey: { $in: [...dates] as string[] },
      status: { $in: ['blocked', 'maintenance', 'available'] },
    },
    session ? { session } : {},
  );
  return result.deletedCount ?? 0;
}
