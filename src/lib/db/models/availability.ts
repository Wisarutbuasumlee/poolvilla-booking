import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { dateKeyField, optionalSatangField } from './shared';

/**
 * The shared calendar. One document per villa per unavailable night.
 *
 * ---------------------------------------------------------------------------
 * ABSENCE MEANS AVAILABLE
 * ---------------------------------------------------------------------------
 * Only non-available nights are stored. Ten villas over two years is a few
 * thousand documents instead of 7,300 rows that all say "available". A row
 * with status 'available' does exist briefly after a release and is treated
 * as equivalent to absence.
 *
 * ---------------------------------------------------------------------------
 * THE UNIQUE INDEX IS THE CORRECTNESS MECHANISM
 * ---------------------------------------------------------------------------
 * uniq_villa_date is what prevents double booking, not the transaction around
 * it. A hold fires one conditional upsert per night; a night somebody else
 * owns fails that upsert with a duplicate-key error, which the storage engine
 * enforces and no amount of application logic can race. See
 * docs/DECISIONS.md D-003 and src/lib/availability/service.ts.
 *
 * ---------------------------------------------------------------------------
 * NIGHTS ARE [checkIn, checkOut)
 * ---------------------------------------------------------------------------
 * The checkout date is never held. Same-day turnover, one guest out at noon
 * and the next in at 2pm, works with no special case anywhere. Every calendar
 * UI has to render it that way or it looks like an off-by-one.
 */

export const AVAILABILITY_STATUSES = [
  'available',
  'held',
  'booked',
  'blocked',
  'maintenance',
] as const;

export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];

const AvailabilitySchema = new Schema(
  {
    villaId: { type: Schema.Types.ObjectId, ref: 'Villa', required: true },
    dateKey: dateKeyField,
    status: { type: String, enum: AVAILABILITY_STATUSES, required: true },

    /** Also the hold token. Generated before the booking document exists. */
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', default: null },
    /** Set only while status is 'held'. */
    holdExpiresAt: { type: Date, default: null },

    /** A one-night price set from the back-office calendar, in satang. */
    priceOverride: optionalSatangField,

    source: {
      type: String,
      enum: ['web', 'agent', 'admin', 'ical', 'system'],
      default: 'system',
    },
    note: { type: String, trim: true },
  },
  { timestamps: true, collection: 'availability' },
);

// The correctness primitive. Nothing else prevents a double booking.
AvailabilitySchema.index({ villaId: 1, dateKey: 1 }, { unique: true, name: 'uniq_villa_date' });

// The expiry sweeper. Partial, so the index stays small even after years of
// bookings: only live holds are ever in it.
//
// Deliberately NOT a TTL index. TTL would appear to work, since deleting the
// document means available, but it runs on a background sweep you cannot tune
// and it would silently delete an admin's manual block if that document ever
// picked up a stray holdExpiresAt. The sweeper also has to expire the booking
// and write a timeline entry, which TTL cannot do.
AvailabilitySchema.index(
  { holdExpiresAt: 1 },
  { name: 'sweeper', partialFilterExpression: { status: 'held' } },
);

// The multi-villa month grid in the back office, and hiding unavailable
// villas on the search page.
AvailabilitySchema.index(
  { dateKey: 1, villaId: 1 },
  {
    name: 'cross_villa_calendar',
    partialFilterExpression: {
      status: { $in: ['held', 'booked', 'blocked', 'maintenance'] },
    },
  },
);

// Releasing or confirming a hold addresses every night of one booking at once.
AvailabilitySchema.index({ bookingId: 1 }, { name: 'by_booking', sparse: true });

export type Availability = InferSchemaType<typeof AvailabilitySchema>;

export const AvailabilityModel: Model<Availability> =
  (mongoose.models.Availability as Model<Availability> | undefined) ??
  mongoose.model<Availability>('Availability', AvailabilitySchema);
