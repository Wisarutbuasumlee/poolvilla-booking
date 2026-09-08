import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { LocalizedTextSchema, dateKeyField, satangField } from './shared';

/**
 * Reference and infrastructure collections: holidays, sequence counters,
 * accounts, promotions, settings and the audit log.
 */

// ---------------------------------------------------------------------------
// holidays
// ---------------------------------------------------------------------------

/**
 * Dates that price as holidays.
 *
 * Long-weekend eves are real rows of type 'long_weekend', not something the
 * pricing engine infers from "is tomorrow a holiday". That keeps the engine
 * pure, lets an admin correct a year the government moved, and makes a
 * disputed bill traceable to a record somebody can show the guest.
 */
const HolidaySchema = new Schema(
  {
    dateKey: dateKeyField,
    name: { type: LocalizedTextSchema, required: true },
    type: {
      type: String,
      enum: ['public', 'substitution', 'long_weekend', 'custom'],
      default: 'public',
    },
    year: { type: Number, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'holidays' },
);

HolidaySchema.index({ dateKey: 1 }, { unique: true, name: 'uniq_date' });
HolidaySchema.index({ year: 1, isActive: 1 }, { name: 'by_year' });

export type Holiday = InferSchemaType<typeof HolidaySchema>;
export const HolidayModel: Model<Holiday> =
  (mongoose.models.Holiday as Model<Holiday> | undefined) ??
  mongoose.model<Holiday>('Holiday', HolidaySchema);

// ---------------------------------------------------------------------------
// counters
// ---------------------------------------------------------------------------

/**
 * Atomic sequence numbers, one document per counter, keyed by day for booking
 * numbers: _id 'BK-20260908', seq 41.
 *
 * The obvious alternative, countDocuments() + 1, races. Two guests confirming
 * in the same second both read 40 and both become BK-20260908-0041, and the
 * unique index rejects one of them after their money has been taken. A
 * single-document $inc cannot do that.
 */
const CounterSchema = new Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { collection: 'counters', versionKey: false },
);

export type Counter = InferSchemaType<typeof CounterSchema>;
export const CounterModel: Model<Counter> =
  (mongoose.models.Counter as Model<Counter> | undefined) ??
  mongoose.model<Counter>('Counter', CounterSchema);

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------

export const ROLES = ['superadmin', 'staff', 'agent'] as const;
export type Role = (typeof ROLES)[number];

/**
 * A back-office account. Guests never have one: booking is guest checkout and
 * a booking is found by its number plus the phone that made it.
 */
const UserSchema = new Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true },
    // argon2id. Never selected by default, so it cannot escape through a
    // careless lean() that gets handed to a client component.
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: ROLES, required: true },
    /** Set when role is 'agent'. Scopes everything that account can see. */
    agentId: { type: Schema.Types.ObjectId, ref: 'Agent' },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true, collection: 'users' },
);

UserSchema.index({ email: 1 }, { unique: true, name: 'uniq_email' });
UserSchema.index({ role: 1, isActive: 1 }, { name: 'by_role' });

export type User = InferSchemaType<typeof UserSchema>;
export const UserModel: Model<User> =
  (mongoose.models.User as Model<User> | undefined) ??
  mongoose.model<User>('User', UserSchema);

// ---------------------------------------------------------------------------
// promotions
// ---------------------------------------------------------------------------

const PromotionSchema = new Schema(
  {
    code: { type: String, required: true, trim: true, uppercase: true },
    label: { type: LocalizedTextSchema, required: true },
    kind: { type: String, enum: ['percent', 'fixed'], required: true },
    /** Percent 0..100, or an amount in satang when kind is 'fixed'. */
    value: { type: Number, required: true, min: 0 },
    appliesTo: { type: String, enum: ['accommodation', 'subtotal'], default: 'subtotal' },
    maxDiscount: { type: Number, min: 0 },
    minNights: { type: Number, min: 1 },
    minSubtotal: { type: Number, min: 0 },
    startsAt: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    endsAt: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    usageLimit: { type: Number, min: 1 },
    usageCount: { type: Number, default: 0, min: 0 },
    villaIds: { type: [Schema.Types.ObjectId], ref: 'Villa', default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'promotions' },
);

PromotionSchema.index({ code: 1 }, { unique: true, name: 'uniq_code' });
PromotionSchema.index({ isActive: 1, startsAt: 1, endsAt: 1 }, { name: 'by_window' });

export type Promotion = InferSchemaType<typeof PromotionSchema>;
export const PromotionModel: Model<Promotion> =
  (mongoose.models.Promotion as Model<Promotion> | undefined) ??
  mongoose.model<Promotion>('Promotion', PromotionSchema);

// ---------------------------------------------------------------------------
// reviews
// ---------------------------------------------------------------------------

/**
 * Reviews are entered by staff for now. The `source` field exists so opening
 * this to guests later is a policy change rather than a migration, and so a
 * staff-entered review can never be presented as a verified guest review.
 */
const ReviewSchema = new Schema(
  {
    villaId: { type: Schema.Types.ObjectId, ref: 'Villa', required: true },
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking' },
    source: { type: String, enum: ['admin', 'guest'], default: 'admin' },
    authorName: { type: String, required: true, trim: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    body: { type: LocalizedTextSchema, required: true },
    stayedOn: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'reviews' },
);

ReviewSchema.index({ villaId: 1, isPublished: 1 }, { name: 'by_villa' });

export type Review = InferSchemaType<typeof ReviewSchema>;
export const ReviewModel: Model<Review> =
  (mongoose.models.Review as Model<Review> | undefined) ??
  mongoose.model<Review>('Review', ReviewSchema);

// ---------------------------------------------------------------------------
// inquiries
// ---------------------------------------------------------------------------

const InquirySchema = new Schema(
  {
    villaId: { type: Schema.Types.ObjectId, ref: 'Villa' },
    agentId: { type: Schema.Types.ObjectId, ref: 'Agent' },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    lineId: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    message: { type: String, trim: true },
    checkIn: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    checkOut: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    guests: { type: Number, min: 1 },
    status: { type: String, enum: ['new', 'contacted', 'converted', 'closed'], default: 'new' },
    handledBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'inquiries' },
);

InquirySchema.index({ status: 1, createdAt: -1 }, { name: 'by_status' });

export type Inquiry = InferSchemaType<typeof InquirySchema>;
export const InquiryModel: Model<Inquiry> =
  (mongoose.models.Inquiry as Model<Inquiry> | undefined) ??
  mongoose.model<Inquiry>('Inquiry', InquirySchema);

// ---------------------------------------------------------------------------
// settings
// ---------------------------------------------------------------------------

/** Singleton, always _id 'site'. */
const SettingSchema = new Schema(
  {
    _id: { type: String, default: 'site' },

    siteName: { type: LocalizedTextSchema, required: true },
    contact: {
      phone: { type: String, trim: true },
      lineId: { type: String, trim: true },
      lineUrl: { type: String, trim: true },
      email: { type: String, trim: true },
      facebookUrl: { type: String, trim: true },
      address: { type: String, trim: true },
    },

    bankAccounts: {
      type: [
        new Schema(
          {
            bankName: { type: String, required: true },
            accountName: { type: String, required: true },
            accountNumber: { type: String, required: true },
            promptPayId: { type: String },
          },
          { _id: false },
        ),
      ],
      default: [],
    },

    depositPercent: { type: Number, default: 30, min: 0, max: 100 },
    holdMinutes: { type: Number, default: 30, min: 5 },

    /** Which price to show when no agent referral applies. */
    priceFallback: {
      type: String,
      enum: ['base_price', 'lowest', 'primary_agent'],
      default: 'base_price',
    },

    cancellationPolicy: { type: LocalizedTextSchema, required: true },
    terms: { type: LocalizedTextSchema },
    privacy: { type: LocalizedTextSchema },
  },
  { timestamps: true, collection: 'settings', versionKey: false },
);

export type Setting = InferSchemaType<typeof SettingSchema>;
export const SettingModel: Model<Setting> =
  (mongoose.models.Setting as Model<Setting> | undefined) ??
  mongoose.model<Setting>('Setting', SettingSchema);

// ---------------------------------------------------------------------------
// audit_logs
// ---------------------------------------------------------------------------

/** Everything that moves money or changes the shared calendar lands here. */
const AuditLogSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },
    actorLabel: { type: String, required: true },
    action: { type: String, required: true },
    entity: { type: String, required: true },
    entityId: { type: String },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    ip: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'audit_logs' },
);

AuditLogSchema.index({ createdAt: -1 }, { name: 'recent' });
AuditLogSchema.index({ actorId: 1, createdAt: -1 }, { name: 'by_actor' });
AuditLogSchema.index({ entity: 1, entityId: 1, createdAt: -1 }, { name: 'by_entity' });

export type AuditLog = InferSchemaType<typeof AuditLogSchema>;
export const AuditLogModel: Model<AuditLog> =
  (mongoose.models.AuditLog as Model<AuditLog> | undefined) ??
  mongoose.model<AuditLog>('AuditLog', AuditLogSchema);

export const SATANG_FIELD = satangField;
