import type { ClientSession } from 'mongoose';
import { CounterModel } from '@/lib/db/models/reference';
import { todayBangkok, type DateKey } from '@/lib/pricing';

/**
 * Booking numbers: BK-20260908-0041.
 *
 * The date part is the Bangkok civil date the booking was MADE, not the
 * check-in date. Staff answer the phone with "what is your booking number"
 * and then want to find it near the day it was taken.
 *
 * The sequence comes from an atomic $inc on a single document. The obvious
 * alternative, counting existing bookings and adding one, races: two guests
 * confirming in the same second both read 40, both become ...-0041, and the
 * unique index rejects one of them after their money has already been taken.
 */
export async function nextBookingNo(
  session?: ClientSession,
  now: DateKey = todayBangkok(),
): Promise<string> {
  const day = now.replace(/-/g, '');

  const counter = await CounterModel.findOneAndUpdate(
    { _id: `BK-${day}` },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after', ...(session ? { session } : {}) },
  );

  return `BK-${day}-${String(counter?.seq ?? 1).padStart(4, '0')}`;
}
