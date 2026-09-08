import { connectToDatabase } from '@/lib/db/connect';
import { BookingModel } from '@/lib/db/models/booking';
import { VillaModel } from '@/lib/db/models/villa';
import { normalisePhone } from '@/lib/validation/booking';

/**
 * Reads for the guest-facing booking pages.
 *
 * There is no guest login, so a booking is fetched by its number. Anything
 * that shows more than the guest's own summary also demands the phone number
 * that made it: a booking number is short enough to guess at, and it should
 * not by itself reveal somebody's name and travel dates.
 */

export async function getBookingForPayment(bookingNo: string) {
  await connectToDatabase();

  const booking = await BookingModel.findOne({ bookingNo }).lean();
  if (!booking) return null;

  const villa = await VillaModel.findById(booking.villaId)
    .select({ code: 1, name: 1, images: 1, 'location.zone': 1 })
    .lean();

  return { booking, villa };
}

/**
 * Booking lookup: number plus the phone that made it.
 *
 * The phone is compared with punctuation stripped, because the number a guest
 * types back is rarely formatted the way it was stored.
 */
export async function findBookingForGuest(bookingNo: string, phone: string) {
  await connectToDatabase();

  const booking = await BookingModel.findOne({ bookingNo }).lean();
  if (!booking) return null;

  if (normalisePhone(booking.customer?.phone ?? '') !== normalisePhone(phone)) return null;

  const villa = await VillaModel.findById(booking.villaId)
    .select({ code: 1, name: 1, 'location.zone': 1, rules: 1 })
    .lean();

  return { booking, villa };
}

/** Seconds left on a hold, or null when the booking is no longer waiting. */
export function holdSecondsLeft(holdExpiresAt: Date | null | undefined): number | null {
  if (!holdExpiresAt) return null;
  const seconds = Math.floor((holdExpiresAt.getTime() - Date.now()) / 1000);
  return seconds > 0 ? seconds : 0;
}
