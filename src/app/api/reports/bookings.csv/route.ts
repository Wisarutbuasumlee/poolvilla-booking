import { NextResponse } from 'next/server';
import { BookingModel } from '@/lib/db/models/booking';
import { connectToDatabase } from '@/lib/db/connect';
import { requireRole } from '@/lib/auth/rbac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Bookings as CSV, for accounting.
 *
 * Money is exported in BAHT with two decimals, not satang. The database is
 * right to store integers, but a spreadsheet column of 1250000 that means
 * 12,500.00 is a mistake waiting to be made by whoever opens it next.
 *
 * Every figure comes from the booking snapshot. An export that re-derived
 * commission from today's rates would produce a different answer each month
 * for the same historical booking.
 */
export async function GET(request: Request) {
  // A public export endpoint would hand out every guest's name and phone
  // number to anyone who guessed the URL.
  await requireRole('superadmin', 'staff');
  await connectToDatabase();

  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  const query: Record<string, unknown> = {};
  if (from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    query.checkIn = { $gte: from, $lte: to };
  }

  const bookings = await BookingModel.find(query).sort({ checkIn: 1 }).limit(5000).lean();

  const header = [
    'bookingNo',
    'status',
    'villaCode',
    'agentCode',
    'checkIn',
    'checkOut',
    'nights',
    'guests',
    'customerName',
    'customerPhone',
    'accommodation',
    'extraGuest',
    'addOns',
    'discount',
    'grandTotal',
    'companyShare',
    'agentMarkup',
    'commission',
    'deposit',
    'balance',
    'damageDeposit',
  ];

  const rows = bookings.map((booking) => [
    booking.bookingNo,
    booking.status,
    booking.villaCodeSnapshot,
    booking.agentCodeSnapshot ?? '',
    booking.checkIn,
    booking.checkOut,
    booking.nights,
    booking.guests?.totalGuests ?? '',
    booking.customer?.name ?? '',
    booking.customer?.phone ?? '',
    baht(booking.priceBreakdown?.accommodationTotal),
    baht(booking.priceBreakdown?.extraGuestTotal),
    baht(booking.priceBreakdown?.addOnTotal),
    baht(booking.priceBreakdown?.discount?.amount),
    baht(booking.priceBreakdown?.grandTotal),
    baht(booking.priceBreakdown?.baseAccommodationTotal),
    baht(booking.priceBreakdown?.markupTotal),
    baht(booking.commission?.amount),
    baht(booking.priceBreakdown?.depositRequired),
    baht(booking.priceBreakdown?.balanceDue),
    baht(booking.priceBreakdown?.damageDeposit),
  ]);

  const csv = [header, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n');

  return new NextResponse(
    // Excel reads a UTF-8 CSV as the system codepage unless it finds a byte
    // order mark, which turns every Thai name into mojibake.
    '\uFEFF' + csv,
    {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="bookings-${from ?? 'all'}.csv"`,
        'Cache-Control': 'no-store',
      },
    },
  );
}

function baht(satang: number | undefined | null): string {
  return ((satang ?? 0) / 100).toFixed(2);
}

/**
 * A cell that cannot break the file or be read as a formula.
 *
 * The leading apostrophe on +, -, = and @ is deliberate: a spreadsheet treats
 * those as the start of a formula, and a guest name beginning with one would
 * otherwise execute when somebody opens the export.
 */
function escapeCell(value: string | number): string {
  const text = String(value ?? '');
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replaceAll('"', '""')}"` : guarded;
}
