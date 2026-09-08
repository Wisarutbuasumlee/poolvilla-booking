import { config } from 'dotenv';
import mongoose, { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AvailabilityModel } from '@/lib/db/models/availability';
import { asDateKey } from '@/lib/pricing';
import type { DateKey } from '@/lib/pricing';
import {
  blockDates,
  confirmHold,
  getBlockedDates,
  getBlockedVillaIds,
  holdNights,
  releaseHold,
  unblockDates,
} from '../service';

config({ path: ['.env.local', '.env'], quiet: true });

/**
 * These run against a real MongoDB, because the thing under test is a unique
 * index. A mock that "enforces" uniqueness in JavaScript would prove nothing:
 * the entire point is that the storage engine arbitrates, so two concurrent
 * writers cannot both win.
 *
 *   npm run db:up && npm test
 */

const URI = (process.env.MONGODB_URI ?? '').replace(/\/poolvilla\b/, '/poolvilla_test');

const d = asDateKey;
const VILLA = new Types.ObjectId();
const OTHER_VILLA = new Types.ObjectId();

const MON = d('2026-06-01');
const TUE = d('2026-06-02');
const WED = d('2026-06-03');
const THU = d('2026-06-04');
const FRI = d('2026-06-05');

let connected = false;

beforeAll(async () => {
  if (!URI) return;
  try {
    await mongoose.connect(URI, { serverSelectionTimeoutMS: 4_000 });
    // autoIndex is off in the app, so the index this whole file depends on has
    // to be built explicitly. Without it every assertion here would pass for
    // the wrong reason.
    await AvailabilityModel.syncIndexes();
    connected = true;
  } catch {
    connected = false;
  }
}, 30_000);

afterEach(async () => {
  if (connected) await AvailabilityModel.deleteMany({});
});

afterAll(async () => {
  if (connected) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

/**
 * Skips when MongoDB is not running, fails when CI says it must be.
 *
 * A developer with the containers stopped should get a clear notice, not
 * eighteen red tests that look like a broken booking system. CI sets
 * REQUIRE_DB=true, where a silent skip would be the worse failure: the whole
 * point of this file is that it runs against a real unique index.
 */
function requireDb(ctx: { skip: () => void }) {
  if (connected) return;

  if (process.env.REQUIRE_DB === 'true') {
    throw new Error('REQUIRE_DB is set but MongoDB is not reachable. Run npm run db:up.');
  }

  if (!warned) {
    warned = true;
    console.warn(
      '\n  Skipping the availability integration tests: MongoDB is not reachable.' +
        '\n  Run `npm run db:up` to exercise the double-booking protection.\n',
    );
  }

  // Vitest treats a thrown skip from within a test as a skip, not a failure.
  ctx.skip();
}

let warned = false;

function hold(checkIn: DateKey, checkOut: DateKey, villaId = VILLA) {
  return holdNights({ villaId, checkIn, checkOut, holdMinutes: 30, source: 'web' });
}

describe('holdNights', () => {
  it('claims one document per night and leaves the checkout date free', async (ctx) => {
    requireDb(ctx);
    const result = await hold(MON, THU);

    expect(result.ok).toBe(true);
    const rows = await AvailabilityModel.find({ villaId: VILLA }).lean();
    expect(rows.map((r) => r.dateKey).sort()).toEqual([MON, TUE, WED]);
    expect(rows.every((r) => r.status === 'held')).toBe(true);
  });

  it('refuses a zero-night range', async (ctx) => {
    requireDb(ctx);
    expect(await hold(MON, MON)).toEqual({ ok: false, reason: 'INVALID_RANGE' });
  });

  it('lets exactly one of twenty concurrent holds win the same nights', async (ctx) => {
    requireDb(ctx);

    const attempts = await Promise.all(Array.from({ length: 20 }, () => hold(MON, THU)));

    const winners = attempts.filter((a) => a.ok);
    expect(winners).toHaveLength(1);
    expect(attempts.filter((a) => !a.ok && a.reason === 'CONFLICT')).toHaveLength(19);

    // The calendar holds three nights for one booking, not nineteen orphans.
    const rows = await AvailabilityModel.find({ villaId: VILLA }).lean();
    expect(rows).toHaveLength(3);
    const owners = new Set(rows.map((r) => String(r.bookingId)));
    expect(owners.size).toBe(1);
  });

  it('leaves nothing behind when a hold only partly overlaps and loses', async (ctx) => {
    requireDb(ctx);
    const first = await hold(MON, THU);
    expect(first.ok).toBe(true);

    // Overlaps on Wednesday only.
    const second = await hold(WED, FRI);
    expect(second).toMatchObject({ ok: false, reason: 'CONFLICT', conflictingDates: [WED] });

    // The loser's Thursday claim must be gone; only the winner's three nights
    // may remain. A leaked claim here is a night nobody can ever book.
    const rows = await AvailabilityModel.find({ villaId: VILLA }).lean();
    expect(rows.map((r) => r.dateKey).sort()).toEqual([MON, TUE, WED]);
  });

  it('allows same-day turnover', async (ctx) => {
    requireDb(ctx);
    // Out on Wednesday, in on Wednesday. Neither booking holds that date.
    expect((await hold(MON, WED)).ok).toBe(true);
    expect((await hold(WED, FRI)).ok).toBe(true);

    const rows = await AvailabilityModel.find({ villaId: VILLA }).lean();
    expect(rows).toHaveLength(4);
  });

  it('does not block a different villa', async (ctx) => {
    requireDb(ctx);
    expect((await hold(MON, THU)).ok).toBe(true);
    expect((await hold(MON, THU, OTHER_VILLA)).ok).toBe(true);
  });

  it('steals a hold that has already expired', async (ctx) => {
    requireDb(ctx);
    const first = await hold(MON, THU);
    expect(first.ok).toBe(true);

    await AvailabilityModel.updateMany(
      { villaId: VILLA },
      { $set: { holdExpiresAt: new Date(Date.now() - 60_000) } },
    );

    const second = await hold(MON, THU);
    expect(second.ok).toBe(true);

    const rows = await AvailabilityModel.find({ villaId: VILLA }).lean();
    expect(rows).toHaveLength(3);
    if (second.ok) {
      expect(rows.every((r) => String(r.bookingId) === String(second.bookingId))).toBe(true);
    }
  });

  it('cannot take a night that is already booked', async (ctx) => {
    requireDb(ctx);
    const first = await hold(MON, THU);
    if (!first.ok) throw new Error('setup failed');
    await confirmHold(first.bookingId);

    const second = await hold(TUE, FRI);
    expect(second).toMatchObject({ ok: false, reason: 'CONFLICT' });
    if (!second.ok && second.reason === 'CONFLICT') {
      expect(second.conflictingDates).toEqual([TUE, WED]);
    }
  });
});

describe('confirmHold and releaseHold', () => {
  it('turns held nights into booked nights and drops the expiry', async (ctx) => {
    requireDb(ctx);
    const result = await hold(MON, THU);
    if (!result.ok) throw new Error('setup failed');

    expect(await confirmHold(result.bookingId)).toBe(true);

    const rows = await AvailabilityModel.find({ villaId: VILLA }).lean();
    expect(rows.every((r) => r.status === 'booked')).toBe(true);
    expect(rows.every((r) => r.holdExpiresAt == null)).toBe(true);
  });

  it('reports false when the hold is already gone', async (ctx) => {
    requireDb(ctx);
    expect(await confirmHold(new Types.ObjectId())).toBe(false);
  });

  it('frees the nights on release and lets somebody else take them', async (ctx) => {
    requireDb(ctx);
    const first = await hold(MON, THU);
    if (!first.ok) throw new Error('setup failed');

    expect(await releaseHold(first.bookingId)).toBe(3);
    expect(await AvailabilityModel.countDocuments({ villaId: VILLA })).toBe(0);
    expect((await hold(MON, THU)).ok).toBe(true);
  });

  it('never releases a confirmed booking', async (ctx) => {
    requireDb(ctx);
    const result = await hold(MON, THU);
    if (!result.ok) throw new Error('setup failed');
    await confirmHold(result.bookingId);

    expect(await releaseHold(result.bookingId)).toBe(0);
    expect(await AvailabilityModel.countDocuments({ status: 'booked' })).toBe(3);
  });
});

describe('reading the calendar', () => {
  it('treats an expired hold as available, so a dead sweeper blocks nobody', async (ctx) => {
    requireDb(ctx);
    const result = await hold(MON, THU);
    if (!result.ok) throw new Error('setup failed');

    expect((await getBlockedDates(VILLA, MON, FRI)).size).toBe(3);

    await AvailabilityModel.updateMany(
      { villaId: VILLA },
      { $set: { holdExpiresAt: new Date(Date.now() - 60_000) } },
    );

    expect((await getBlockedDates(VILLA, MON, FRI)).size).toBe(0);
    expect((await getBlockedVillaIds([VILLA], MON, THU)).size).toBe(0);
  });

  it('finds every villa that cannot take the stay in one query', async (ctx) => {
    requireDb(ctx);
    expect((await hold(MON, THU)).ok).toBe(true);

    const blocked = await getBlockedVillaIds([VILLA, OTHER_VILLA], MON, THU);
    expect([...blocked]).toEqual([VILLA.toString()]);
  });

  it('excludes the checkout date when checking a range', async (ctx) => {
    requireDb(ctx);
    // Only Wednesday is held.
    expect((await hold(WED, THU)).ok).toBe(true);

    // A stay that checks out on Wednesday does not touch it.
    expect((await getBlockedVillaIds([VILLA], MON, WED)).size).toBe(0);
    // A stay that spends Wednesday night does.
    expect((await getBlockedVillaIds([VILLA], MON, THU)).size).toBe(1);
  });
});

describe('manual blocking', () => {
  it('blocks free dates and reports them', async (ctx) => {
    requireDb(ctx);
    const result = await blockDates({
      villaId: VILLA,
      dates: [MON, TUE],
      status: 'maintenance',
      source: 'admin',
      note: 'pool resurfacing',
    });

    expect(result.blocked).toEqual([MON, TUE]);
    expect(result.skipped).toEqual([]);
  });

  it('refuses to block over a confirmed booking', async (ctx) => {
    requireDb(ctx);
    const booking = await hold(MON, THU);
    if (!booking.ok) throw new Error('setup failed');
    await confirmHold(booking.bookingId);

    // Dragging across a month grid must never quietly hide a paid booking.
    const result = await blockDates({
      villaId: VILLA,
      dates: [MON, TUE, WED, THU],
      status: 'blocked',
      source: 'admin',
    });

    expect(result.skipped).toEqual([MON, TUE, WED]);
    expect(result.blocked).toEqual([THU]);
    expect(await AvailabilityModel.countDocuments({ status: 'booked' })).toBe(3);
  });

  it('unblocks only manual blocks', async (ctx) => {
    requireDb(ctx);
    await blockDates({ villaId: VILLA, dates: [MON], status: 'blocked', source: 'admin' });
    const booking = await hold(TUE, WED);
    if (!booking.ok) throw new Error('setup failed');
    await confirmHold(booking.bookingId);

    expect(await unblockDates(VILLA, [MON, TUE])).toBe(1);
    expect(await AvailabilityModel.countDocuments({ status: 'booked' })).toBe(1);
  });
});
