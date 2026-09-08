import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/connect';
import { AvailabilityModel } from '@/lib/db/models/availability';
import { BookingModel } from '@/lib/db/models/booking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Releases bookings whose payment window has closed.
 *
 * Order matters. The BOOKING is expired first, with a conditional update that
 * still requires the hold to be live. A confirmation arriving in the same
 * moment either wins that update or loses it, and whichever loses sees zero
 * modified documents and leaves the calendar alone. Freeing the nights first
 * would let a booking be confirmed against dates that had just been released.
 *
 * The system does not depend on this running. Reads treat an expired hold as
 * available, so a sweeper that is down leaves the back office looking untidy
 * and blocks no real guest. Run it every five minutes.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

  if (!secret || provided !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  await connectToDatabase();

  const now = new Date();
  const expired = await BookingModel.find(
    { status: 'awaiting_payment', holdExpiresAt: { $lt: now } },
    { _id: 1, bookingNo: 1 },
  )
    .limit(500)
    .lean();

  let released = 0;
  let nights = 0;

  for (const booking of expired) {
    const result = await BookingModel.updateOne(
      { _id: booking._id, status: 'awaiting_payment', holdExpiresAt: { $lt: new Date() } },
      {
        $set: { status: 'expired' },
        $unset: { holdExpiresAt: '' },
        $push: { timeline: { at: new Date(), by: 'system', action: 'hold_expired' } },
      },
    );

    // A confirmation beat us to it. Its nights stay booked.
    if (result.modifiedCount !== 1) continue;

    const removed = await AvailabilityModel.deleteMany({
      bookingId: booking._id,
      status: 'held',
    });

    released += 1;
    nights += removed.deletedCount ?? 0;
  }

  // Orphans: a crash between claiming nights and writing the booking leaves
  // held rows no booking will ever confirm. The grace period keeps this from
  // racing a hold that is mid-creation right now.
  const orphans = await AvailabilityModel.deleteMany({
    status: 'held',
    holdExpiresAt: { $lt: new Date(Date.now() - 5 * 60_000) },
  });

  return NextResponse.json({
    released,
    nights,
    orphanNights: orphans.deletedCount ?? 0,
    at: now.toISOString(),
  });
}

/** Convenience for a cron runner that can only issue GET. */
export const GET = POST;
