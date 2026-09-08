import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/db/connect';
import { AvailabilityModel } from '@/lib/db/models/availability';
import { BookingModel } from '@/lib/db/models/booking';
import { VillaModel } from '@/lib/db/models/villa';
import { addDays, nightsBetween, todayBangkok, type DateKey } from '@/lib/pricing';
import type { Actor } from '@/lib/auth/rbac';

/**
 * Dashboard and reporting.
 *
 * Two rules run through every figure here, and breaking either one produces
 * numbers that look plausible and are wrong:
 *
 *   1. Revenue is priceBreakdown.grandTotal from the booking snapshot. The
 *      damage deposit is held, not earned, and never appears in revenue,
 *      commission or ADR.
 *
 *   2. ADR is accommodationTotal divided by nights, not grandTotal divided by
 *      nights. Add-ons and extra-guest fees are not a room rate, and folding
 *      them in makes every villa look more expensive than it is.
 */

/** Bookings that represent money. Cancelled and expired ones are not revenue. */
const EARNING = ['confirmed', 'checked_in', 'completed'] as const;

export interface DateRange {
  from: DateKey;
  to: DateKey;
}

export interface Kpis {
  revenue: number;
  bookings: number;
  nightsSold: number;
  /** Average daily rate: accommodation only. */
  adr: number;
  /** Nights sold as a share of nights available, 0..1. */
  occupancy: number;
  commission: number;
  awaitingPayment: number;
  awaitingPaymentCount: number;
}

export async function getKpis(range: DateRange, actor: Actor): Promise<Kpis> {
  await connectToDatabase();

  const scope = await bookingScope(actor);

  const [totals, pending, villaCount] = await Promise.all([
    BookingModel.aggregate<{
      revenue: number;
      bookings: number;
      nights: number;
      accommodation: number;
      commission: number;
    }>([
      {
        $match: {
          ...scope,
          status: { $in: EARNING },
          // A booking counts in the period it is STAYED, not the period it was
          // made. A December booking for April is April's revenue, which is
          // what an occupancy figure has to agree with.
          checkIn: { $gte: range.from, $lte: range.to },
        },
      },
      {
        $group: {
          _id: null,
          revenue: { $sum: '$priceBreakdown.grandTotal' },
          bookings: { $sum: 1 },
          nights: { $sum: '$nights' },
          accommodation: { $sum: '$priceBreakdown.accommodationTotal' },
          commission: { $sum: '$commission.amount' },
        },
      },
    ]),

    BookingModel.aggregate<{ amount: number; count: number }>([
      { $match: { ...scope, status: 'awaiting_payment' } },
      {
        $group: {
          _id: null,
          amount: { $sum: '$priceBreakdown.depositRequired' },
          count: { $sum: 1 },
        },
      },
    ]),

    VillaModel.countDocuments({ status: 'published' }),
  ]);

  const row = totals[0];
  const nights = row?.nights ?? 0;
  const days = Math.max(1, nightsBetween(range.from, range.to) + 1);

  return {
    revenue: row?.revenue ?? 0,
    bookings: row?.bookings ?? 0,
    nightsSold: nights,
    adr: nights > 0 ? Math.round((row?.accommodation ?? 0) / nights) : 0,
    // Villa-nights available across the whole period. With no published
    // villas this is zero rather than a division by zero.
    occupancy: villaCount > 0 ? nights / (villaCount * days) : 0,
    commission: row?.commission ?? 0,
    awaitingPayment: pending[0]?.amount ?? 0,
    awaitingPaymentCount: pending[0]?.count ?? 0,
  };
}

export interface DailyPoint {
  date: string;
  revenue: number;
  bookings: number;
}

/** Revenue by check-in date, with empty days filled in. */
export async function getDailyRevenue(range: DateRange, actor: Actor): Promise<DailyPoint[]> {
  await connectToDatabase();
  const scope = await bookingScope(actor);

  const rows = await BookingModel.aggregate<{ _id: string; revenue: number; bookings: number }>([
    {
      $match: {
        ...scope,
        status: { $in: EARNING },
        checkIn: { $gte: range.from, $lte: range.to },
      },
    },
    {
      $group: {
        _id: '$checkIn',
        revenue: { $sum: '$priceBreakdown.grandTotal' },
        bookings: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const byDate = new Map(rows.map((row) => [row._id, row]));

  // Days with no bookings are zeroes, not gaps. A line chart that skips them
  // draws a straight line through a quiet week and hides it.
  const points: DailyPoint[] = [];
  let cursor = range.from;
  while (cursor <= range.to) {
    const row = byDate.get(cursor);
    points.push({ date: cursor, revenue: row?.revenue ?? 0, bookings: row?.bookings ?? 0 });
    cursor = addDays(cursor, 1);
  }

  return points;
}

export interface VillaPerformance {
  code: string;
  name: string;
  bookings: number;
  revenue: number;
  nights: number;
}

export async function getTopVillas(range: DateRange, actor: Actor, limit = 10) {
  await connectToDatabase();
  const scope = await bookingScope(actor);

  const rows = await BookingModel.aggregate<{
    _id: Types.ObjectId;
    code: string;
    bookings: number;
    revenue: number;
    nights: number;
  }>([
    {
      $match: {
        ...scope,
        status: { $in: EARNING },
        checkIn: { $gte: range.from, $lte: range.to },
      },
    },
    {
      $group: {
        _id: '$villaId',
        code: { $first: '$villaCodeSnapshot' },
        bookings: { $sum: 1 },
        revenue: { $sum: '$priceBreakdown.grandTotal' },
        nights: { $sum: '$nights' },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: limit },
  ]);

  const villas = await VillaModel.find(
    { _id: { $in: rows.map((row) => row._id) } },
    { code: 1, name: 1 },
  ).lean();
  const nameBy = new Map(villas.map((villa) => [villa._id.toString(), villa.name?.th ?? villa.code]));

  return rows.map((row) => ({
    code: row.code,
    name: nameBy.get(row._id.toString()) ?? row.code,
    bookings: row.bookings,
    revenue: row.revenue,
    nights: row.nights,
  }));
}

export interface AgentPerformance {
  agentCode: string;
  bookings: number;
  revenue: number;
  markup: number;
  commission: number;
}

/** Who sold what. A booking with no agent is grouped as direct. */
export async function getAgentBreakdown(range: DateRange): Promise<AgentPerformance[]> {
  await connectToDatabase();

  const rows = await BookingModel.aggregate<{
    _id: string | null;
    bookings: number;
    revenue: number;
    markup: number;
    commission: number;
  }>([
    {
      $match: {
        status: { $in: EARNING },
        checkIn: { $gte: range.from, $lte: range.to },
      },
    },
    {
      $group: {
        _id: '$agentCodeSnapshot',
        bookings: { $sum: 1 },
        revenue: { $sum: '$priceBreakdown.grandTotal' },
        markup: { $sum: '$priceBreakdown.markupTotal' },
        commission: { $sum: '$commission.amount' },
      },
    },
    { $sort: { revenue: -1 } },
  ]);

  return rows.map((row) => ({
    agentCode: row._id ?? 'direct',
    bookings: row.bookings,
    revenue: row.revenue,
    markup: row.markup,
    commission: row.commission,
  }));
}

/** Arrivals and departures for the next few days. */
export async function getUpcoming(actor: Actor, days = 7) {
  await connectToDatabase();
  const scope = await bookingScope(actor);

  const today = todayBangkok();
  const horizon = addDays(today, days);

  const [arrivals, departures] = await Promise.all([
    BookingModel.find({
      ...scope,
      status: { $in: ['confirmed', 'checked_in'] },
      checkIn: { $gte: today, $lte: horizon },
    })
      .select({ bookingNo: 1, villaCodeSnapshot: 1, checkIn: 1, 'customer.name': 1, 'customer.phone': 1, 'guests.totalGuests': 1 })
      .sort({ checkIn: 1 })
      .limit(50)
      .lean(),

    BookingModel.find({
      ...scope,
      status: { $in: ['checked_in', 'confirmed'] },
      checkOut: { $gte: today, $lte: horizon },
    })
      .select({ bookingNo: 1, villaCodeSnapshot: 1, checkOut: 1, 'customer.name': 1 })
      .sort({ checkOut: 1 })
      .limit(50)
      .lean(),
  ]);

  return { arrivals, departures };
}

/** Bookings whose slip is waiting for somebody to look at it. */
export async function getSlipsAwaitingReview(actor: Actor, limit = 20) {
  await connectToDatabase();
  const scope = await bookingScope(actor);

  return BookingModel.find({ ...scope, 'payment.depositStatus': 'pending_review' })
    .select({
      bookingNo: 1,
      villaCodeSnapshot: 1,
      checkIn: 1,
      'customer.name': 1,
      'priceBreakdown.depositRequired': 1,
      'payment.slips': 1,
    })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();
}

/**
 * The multi-villa month grid.
 *
 * One query for the whole board. Asking per villa would be thirty queries for
 * a thirty-villa month, and this is the screen staff leave open all day.
 */
export async function getCalendarGrid(from: DateKey, to: DateKey) {
  await connectToDatabase();

  const villas = await VillaModel.find(
    { status: { $in: ['published', 'hidden'] } },
    { code: 1, name: 1 },
  )
    .sort({ code: 1 })
    .lean();

  const rows = await AvailabilityModel.find(
    {
      villaId: { $in: villas.map((villa) => villa._id) },
      dateKey: { $gte: from, $lte: to },
      $or: [
        { status: { $in: ['booked', 'blocked', 'maintenance'] } },
        // An expired hold is free everywhere else in the system, so it must
        // read as free here too or staff will chase a phantom.
        { status: 'held', holdExpiresAt: { $gt: new Date() } },
      ],
    },
    { villaId: 1, dateKey: 1, status: 1 },
  ).lean();

  const byVilla = new Map<string, Map<string, string>>();
  for (const row of rows) {
    const id = row.villaId.toString();
    if (!byVilla.has(id)) byVilla.set(id, new Map());
    byVilla.get(id)!.set(row.dateKey, row.status);
  }

  return villas.map((villa) => ({
    id: villa._id.toString(),
    code: villa.code,
    name: villa.name?.th ?? villa.code,
    days: byVilla.get(villa._id.toString()) ?? new Map<string, string>(),
  }));
}

/** Agents see only their own bookings; staff see everything. */
async function bookingScope(actor: Actor): Promise<Record<string, unknown>> {
  if (actor.role !== 'agent') return {};
  return { agentId: actor.agentId ? new Types.ObjectId(actor.agentId) : null };
}
