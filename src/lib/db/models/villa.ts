import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { AMENITIES, IMAGE_CATEGORIES } from '@/lib/villas/constants';
import {
  DayRatesSchema,
  LocalizedTextSchema,
  OptionalLocalizedTextSchema,
  PriceOverrideSchema,
  optionalSatangField,
  satangField,
} from './shared';

/**
 * A villa, including the COMPANY'S OWN nightly rates.
 *
 * This differs from the original spec, which put every price on the
 * villa-agent link and left the villa priceless. The business works the other
 * way round: the company already has a rate for each house and hands it to
 * agents who add their own margin. Keeping the base here means raising it once
 * moves every agent's price with it. See docs/DECISIONS.md D-001.
 */

// Re-exported so existing server imports keep working. The values live in a
// dependency-free module because client components need them too, and reaching
// them through this file would drag Mongoose into the browser bundle.
export { AMENITIES, IMAGE_CATEGORIES } from '@/lib/villas/constants';

const BedSchema = new Schema(
  {
    sizeFt: { type: Number, required: true, min: 2, max: 8 },
    count: { type: Number, required: true, min: 1 },
    type: { type: String, enum: ['single', 'double', 'bunk', 'extra'], default: 'double' },
  },
  { _id: false },
);

const BedroomSchema = new Schema(
  {
    index: { type: Number, required: true, min: 1 },
    beds: { type: [BedSchema], default: [] },
    sleeps: { type: Number, required: true, min: 1 },
    hasEnsuite: { type: Boolean, default: false },
    note: { type: String, trim: true },
  },
  { _id: false },
);

const ImageSchema = new Schema({
  url: { type: String, required: true },
  thumbUrl: { type: String },
  category: { type: String, enum: IMAGE_CATEGORIES, default: 'exterior' },
  order: { type: Number, default: 0 },
  alt: { type: OptionalLocalizedTextSchema, default: undefined },
  isCover: { type: Boolean, default: false },
  // Development placeholders must never be presented to a visitor as a real
  // photograph of a real house.
  isSynthetic: { type: Boolean, default: false },
});

const ExtraChargeSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: LocalizedTextSchema, required: true },
    price: satangField,
    unit: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const VillaSchema = new Schema(
  {
    code: { type: String, required: true, trim: true, uppercase: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    status: {
      type: String,
      enum: ['draft', 'published', 'hidden'],
      default: 'draft',
      required: true,
    },

    name: { type: LocalizedTextSchema, required: true },
    description: { type: OptionalLocalizedTextSchema, default: undefined },
    highlights: { type: OptionalLocalizedTextSchema, default: undefined },

    location: {
      province: { type: String, required: true, trim: true },
      district: { type: String, trim: true },
      zone: { type: String, required: true, trim: true },
      landmark: { type: String, trim: true },
      latitude: { type: Number, min: -90, max: 90 },
      longitude: { type: Number, min: -180, max: 180 },
      distanceToBeachKm: { type: Number, min: 0 },
      googleMapUrl: { type: String, trim: true },
    },

    capacity: {
      bedrooms: { type: Number, required: true, min: 1 },
      bathrooms: { type: Number, required: true, min: 1 },
      baseGuests: { type: Number, required: true, min: 1 },
      maxExtraGuests: { type: Number, required: true, min: 0, default: 0 },
      extraGuestFee: satangField,
      freeChildUnder10Quota: { type: Number, required: true, min: 0, default: 0 },
    },

    // --- The company's own prices. Bookable on their own. ---
    basePricing: { type: DayRatesSchema, required: true },
    baseOverrides: { type: [PriceOverrideSchema], default: [] },
    minNights: { type: Number, required: true, min: 1, default: 1 },

    damageDeposit: satangField,
    /** Overrides the site-wide default when set. */
    depositPercentOverride: { type: Number, min: 0, max: 100 },

    pool: {
      isPrivate: { type: Boolean, default: true },
      system: { type: String, enum: ['chlorine', 'saltwater'], default: 'chlorine' },
      widthM: { type: Number, min: 0 },
      lengthM: { type: Number, min: 0 },
      depthM: { type: Number, min: 0 },
      hasSlider: { type: Boolean, default: false },
      sliderHeightM: { type: Number, min: 0 },
      hasKidPool: { type: Boolean, default: false },
    },

    amenities: { type: [{ type: String, enum: AMENITIES }], default: [] },
    bedroomDetails: { type: [BedroomSchema], default: [] },
    extraMattressSleeps: { type: Number, min: 0, default: 0 },

    kitchen: {
      available: { type: [String], default: [] },
      unavailable: { type: [String], default: [] },
    },

    rules: {
      checkInFrom: { type: String, default: '14:00' },
      checkOutBefore: { type: String, default: '12:00' },
      petAllowed: { type: Boolean, default: false },
      petNote: { type: OptionalLocalizedTextSchema, default: undefined },
      loudMusicAllowed: { type: Boolean, default: false },
      loudMusicNote: { type: OptionalLocalizedTextSchema, default: undefined },
      smokingPolicy: {
        type: String,
        enum: ['not_allowed', 'outdoor_only', 'allowed'],
        default: 'outdoor_only',
      },
      partyPolicy: {
        type: String,
        enum: ['not_allowed', 'allowed', 'on_request'],
        default: 'allowed',
      },
    },

    parking: {
      inHouse: { type: Number, min: 0, default: 0 },
      garage: { type: Number, min: 0, default: 0 },
    },

    extraCharges: { type: [ExtraChargeSchema], default: [] },
    additionalNotes: { type: OptionalLocalizedTextSchema, default: undefined },

    nearbyAttractions: {
      type: [
        new Schema(
          {
            name: { type: LocalizedTextSchema, required: true },
            distanceKm: { type: Number, min: 0 },
            category: { type: String, trim: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },

    images: { type: [ImageSchema], default: [] },

    seo: {
      title: { type: OptionalLocalizedTextSchema, default: undefined },
      description: { type: OptionalLocalizedTextSchema, default: undefined },
    },

    stats: {
      viewCount: { type: Number, default: 0 },
      bookingCount: { type: Number, default: 0 },
      avgRating: { type: Number, min: 0, max: 5 },
    },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'villas' },
);

VillaSchema.index({ code: 1 }, { unique: true, name: 'uniq_code' });
VillaSchema.index({ slug: 1 }, { unique: true, name: 'uniq_slug' });
// The search page filters on status plus zone or bedroom count on nearly
// every request; these two cover it without a collection scan.
VillaSchema.index({ status: 1, 'location.zone': 1 }, { name: 'search_by_zone' });
VillaSchema.index({ status: 1, 'capacity.bedrooms': 1 }, { name: 'search_by_bedrooms' });
VillaSchema.index({ 'name.th': 'text', 'name.en': 'text' }, { name: 'search_text' });

export type Villa = InferSchemaType<typeof VillaSchema>;

export const VillaModel: Model<Villa> =
  (mongoose.models.Villa as Model<Villa> | undefined) ??
  mongoose.model<Villa>('Villa', VillaSchema);

/** Everything the villa card needs, and nothing it does not. */
export const VILLA_CARD_PROJECTION = {
  code: 1,
  slug: 1,
  name: 1,
  'location.zone': 1,
  'location.province': 1,
  'location.distanceToBeachKm': 1,
  capacity: 1,
  basePricing: 1,
  baseOverrides: 1,
  minNights: 1,
  damageDeposit: 1,
  amenities: 1,
  'pool.hasSlider': 1,
  images: { $slice: 5 },
  stats: 1,
} as const;

export const optionalSatang = optionalSatangField;
