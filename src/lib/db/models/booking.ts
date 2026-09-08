import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { DayRatesSchema, PriceOverrideSchema, dateKeyField, satangField } from './shared';

/**
 * A booking, with the price frozen at the moment it was made.
 *
 * Agent markups and company base rates change. A booking must not. Everything
 * needed to reproduce and defend the total is stored here, so a dispute six
 * months later is answered from this one document and re-running the pricing
 * engine on the snapshot gives back the same number to the satang.
 *
 * Every report reads priceBreakdown.grandTotal. None of them join back to
 * villa_agents, which would restate history every time somebody edited a rate.
 */

export const BOOKING_STATUSES = [
  'pending',
  'awaiting_payment',
  'confirmed',
  'checked_in',
  'completed',
  'cancelled',
  'no_show',
  'expired',
] as const;

const NightLineSchema = new Schema(
  {
    dateKey: dateKeyField,
    dayType: { type: String, enum: ['SUN_THU', 'FRI', 'SAT', 'HOLIDAY'], required: true },
    // Split so a payout run can tell the company's money from the agent's
    // without recomputing anything.
    basePrice: satangField,
    markup: { type: Number, required: true, min: 0 },
    price: satangField,
    baseRule: { type: String, required: true },
    markupRule: { type: String, required: true },
    baseOverrideId: { type: String },
    markupOverrideId: { type: String },
  },
  { _id: false },
);

const AddOnLineSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    qty: { type: Number, required: true, min: 1 },
    unitPrice: satangField,
    total: satangField,
  },
  { _id: false },
);

const SlipSchema = new Schema({
  url: { type: String, required: true },
  amount: satangField,
  uploadedAt: { type: Date, default: Date.now },
  verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  verifiedAt: { type: Date },
  rejectedReason: { type: String, trim: true },
});

const BookingSchema = new Schema(
  {
    bookingNo: { type: String, required: true, trim: true },

    villaId: { type: Schema.Types.ObjectId, ref: 'Villa', required: true },
    villaCodeSnapshot: { type: String, required: true },
    agentId: { type: Schema.Types.ObjectId, ref: 'Agent', default: null },
    agentCodeSnapshot: { type: String, default: null },

    customer: {
      name: { type: String, required: true, trim: true },
      phone: { type: String, required: true, trim: true },
      email: { type: String, trim: true, lowercase: true },
      lineId: { type: String, trim: true },
      country: { type: String, trim: true, default: 'TH' },
    },

    checkIn: dateKeyField,
    checkOut: dateKeyField,
    nights: { type: Number, required: true, min: 1 },

    guests: {
      adults: { type: Number, required: true, min: 1 },
      children: { type: Number, default: 0, min: 0 },
      childrenUnder10: { type: Number, default: 0, min: 0 },
      totalGuests: { type: Number, required: true, min: 1 },
      extraGuests: { type: Number, default: 0, min: 0 },
    },

    priceBreakdown: {
      nights: { type: [NightLineSchema], required: true },
      accommodationTotal: satangField,
      baseAccommodationTotal: satangField,
      markupTotal: { type: Number, required: true, min: 0 },
      extraGuestTotal: { type: Number, required: true, min: 0 },
      addOns: { type: [AddOnLineSchema], default: [] },
      addOnTotal: { type: Number, required: true, min: 0 },
      subtotal: satangField,
      discount: {
        code: { type: String, default: null },
        amount: { type: Number, default: 0, min: 0 },
      },
      grandTotal: satangField,
      // Held, not earned. Excluded from grandTotal, from commission and from
      // every revenue figure, and returned at check-out.
      damageDeposit: { type: Number, required: true, min: 0 },
      depositRequired: { type: Number, required: true, min: 0 },
      balanceDue: { type: Number, required: true, min: 0 },
      currency: { type: String, default: 'THB' },
    },

    /** The resolved rate card, so the quote can be reproduced exactly. */
    rateCardSnapshot: {
      base: { type: DayRatesSchema, required: true },
      baseOverrides: { type: [PriceOverrideSchema], default: [] },
      markup: { type: DayRatesSchema, required: true },
      markupOverrides: { type: [PriceOverrideSchema], default: [] },
      extraGuestFee: { type: Number, required: true, min: 0 },
      minNights: { type: Number, required: true, min: 1 },
      source: { type: String, required: true },
    },
    pricingEngineVersion: { type: String, required: true, default: 'v1' },

    commission: {
      rate: { type: Number, default: 0, min: 0, max: 1 },
      amount: { type: Number, default: 0, min: 0 },
    },

    payment: {
      method: {
        type: String,
        enum: ['bank_transfer', 'promptpay', 'card'],
        default: 'bank_transfer',
      },
      depositStatus: {
        type: String,
        enum: ['unpaid', 'pending_review', 'paid', 'rejected'],
        default: 'unpaid',
      },
      depositPaidAt: { type: Date },
      balanceStatus: {
        type: String,
        enum: ['unpaid', 'pending_review', 'paid', 'waived'],
        default: 'unpaid',
      },
      balancePaidAt: { type: Date },
      slips: { type: [SlipSchema], default: [] },
    },

    status: { type: String, enum: BOOKING_STATUSES, required: true, default: 'awaiting_payment' },
    /** Present only while awaiting payment. The sweeper reads it. */
    holdExpiresAt: { type: Date, default: null },

    source: {
      type: String,
      enum: ['web', 'agent_link', 'manual', 'walk_in'],
      default: 'web',
    },

    cancellation: {
      reason: { type: String, trim: true },
      at: { type: Date },
      by: { type: Schema.Types.ObjectId, ref: 'User' },
      refundAmount: { type: Number, min: 0 },
    },

    internalNotes: { type: String, trim: true },
    timeline: {
      type: [
        new Schema(
          {
            at: { type: Date, default: Date.now },
            by: { type: String, default: 'system' },
            action: { type: String, required: true },
            detail: { type: String },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { timestamps: true, collection: 'bookings' },
);

BookingSchema.index({ bookingNo: 1 }, { unique: true, name: 'uniq_booking_no' });
// The sweeper. Partial, so it only ever contains live holds.
BookingSchema.index(
  { holdExpiresAt: 1 },
  { name: 'sweeper', partialFilterExpression: { status: 'awaiting_payment' } },
);
BookingSchema.index({ villaId: 1, checkIn: 1 }, { name: 'by_villa' });
BookingSchema.index({ agentId: 1, createdAt: -1 }, { name: 'by_agent' });
BookingSchema.index({ status: 1, createdAt: -1 }, { name: 'by_status' });
// Guest booking lookup: number plus the phone that made it.
BookingSchema.index({ 'customer.phone': 1 }, { name: 'by_phone' });
// Arrivals today and tomorrow.
BookingSchema.index({ checkIn: 1, status: 1 }, { name: 'by_arrival' });

export type Booking = InferSchemaType<typeof BookingSchema>;

export const BookingModel: Model<Booking> =
  (mongoose.models.Booking as Model<Booking> | undefined) ??
  mongoose.model<Booking>('Booking', BookingSchema);
