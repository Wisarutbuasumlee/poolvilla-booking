import { Schema } from 'mongoose';

/**
 * Building blocks shared by several schemas.
 *
 * Two conventions run through all of them:
 *
 *   - Money is an integer number of satang. ฿12,500 is 1_250_000. Mongoose
 *     has no decimal type worth using here, and a Double would reintroduce
 *     exactly the rounding the pricing engine avoids.
 *
 *   - A calendar date is a 'YYYY-MM-DD' string, never a Date. Lexicographic
 *     order matches chronological order for this format, so ranges and
 *     indexes work normally, and there is no UTC shift to get wrong. See
 *     docs/DECISIONS.md D-002.
 */

export const DATE_KEY_MATCH = /^\d{4}-\d{2}-\d{2}$/;

/** Amount in satang. Never negative, never fractional. */
export const satangField = {
  type: Number,
  required: true,
  min: 0,
  validate: {
    validator: Number.isInteger,
    message: '{PATH} must be an integer number of satang, not baht',
  },
} as const;

export const optionalSatangField = {
  type: Number,
  min: 0,
  default: undefined,
  validate: {
    validator: (value: number | undefined) => value === undefined || Number.isInteger(value),
    message: '{PATH} must be an integer number of satang, not baht',
  },
} as const;

/** A civil date in Asia/Bangkok. */
export const dateKeyField = {
  type: String,
  required: true,
  match: [DATE_KEY_MATCH, '{PATH} must be a YYYY-MM-DD date in Asia/Bangkok'],
} as const;

/**
 * Guest-facing text in three languages.
 *
 * Thai is required and authoritative. The other two are optional and fall back
 * to Thai at render time, because showing a visitor Thai is better than
 * showing them an empty field or a key path.
 */
export const LocalizedTextSchema = new Schema(
  {
    th: { type: String, required: true, trim: true },
    en: { type: String, trim: true },
    zh: { type: String, trim: true },
  },
  { _id: false },
);

/** Optional variant, for fields that may be absent entirely. */
export const OptionalLocalizedTextSchema = new Schema(
  {
    th: { type: String, trim: true },
    en: { type: String, trim: true },
    zh: { type: String, trim: true },
  },
  { _id: false },
);

export const DAY_TYPES = ['SUN_THU', 'FRI', 'SAT', 'HOLIDAY'] as const;
export const OVERRIDE_DAY_TYPES = [...DAY_TYPES, 'ALL'] as const;

/** The four nightly rates. Used for base prices and for agent markups alike. */
export const DayRatesSchema = new Schema(
  {
    sunThu: satangField,
    fri: satangField,
    sat: satangField,
    holiday: satangField,
  },
  { _id: false },
);

/**
 * A dated price rule.
 *
 * On a villa, `price` is the company's nightly rate for that window. On a
 * villa-agent link it is that agent's markup. The pricing engine selects both
 * with the same algorithm, so a festival window behaves identically whichever
 * layer declared it.
 *
 * `_id` is deliberately kept: the engine's tie-break ends on it, and a booking
 * records which override priced each night.
 */
export const PriceOverrideSchema = new Schema({
  label: { type: OptionalLocalizedTextSchema, default: undefined },
  startDate: dateKeyField,
  endDate: {
    ...dateKeyField,
    validate: {
      // Both are 'YYYY-MM-DD', where string order is chronological order.
      // A backwards window would silently price nothing and be very hard to
      // spot in the back office, so it is refused at write time.
      validator(this: { startDate?: string }, value: string) {
        return !this.startDate || value >= this.startDate;
      },
      message: 'Override endDate must not be before startDate',
    },
  },
  dayTypes: {
    type: [{ type: String, enum: OVERRIDE_DAY_TYPES }],
    required: true,
    default: () => ['ALL'],
    validate: {
      validator: (value: string[]) => value.length > 0,
      message: 'An override must target at least one day type',
    },
  },
  price: satangField,
  minNights: { type: Number, min: 1 },
});
