import { z } from 'zod';
import { AMENITIES } from '@/lib/villas/constants';

/**
 * One schema, used by the form and by the Server Action.
 *
 * The action re-parses whatever it receives. The client-side copy exists to
 * give fast feedback, not to be trusted: a Server Action is a public endpoint
 * and anything can post to it.
 */

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Baht in the form, satang in the database. Nobody types satang. */
const bahtToSatang = z
  .coerce.number()
  .min(0, 'ต้องไม่ติดลบ')
  .max(10_000_000)
  .transform((value) => Math.round(value * 100));

export const LocalizedTextSchema = z.object({
  th: z.string().trim().min(1, 'กรุณากรอกภาษาไทย'),
  en: z.string().trim().optional(),
  zh: z.string().trim().optional(),
});

export const OptionalLocalizedTextSchema = z.object({
  th: z.string().trim().optional(),
  en: z.string().trim().optional(),
  zh: z.string().trim().optional(),
});

export const DayRatesSchema = z.object({
  sunThu: bahtToSatang,
  fri: bahtToSatang,
  sat: bahtToSatang,
  holiday: bahtToSatang,
});

export const PriceOverrideSchema = z
  .object({
    label: OptionalLocalizedTextSchema.optional(),
    startDate: z.string().regex(DATE_KEY),
    endDate: z.string().regex(DATE_KEY),
    dayTypes: z
      .array(z.enum(['SUN_THU', 'FRI', 'SAT', 'HOLIDAY', 'ALL']))
      .min(1, 'เลือกอย่างน้อยหนึ่งประเภทวัน'),
    price: bahtToSatang,
    minNights: z.coerce.number().int().min(1).optional(),
  })
  .refine((value) => value.endDate >= value.startDate, {
    message: 'วันสิ้นสุดต้องไม่มาก่อนวันเริ่ม',
    path: ['endDate'],
  });

export const VillaFormSchema = z
  .object({
    // Codes are printed on contracts and quoted over the phone, so the shape
    // is fixed rather than free text.
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}-\d{3,6}$/, 'รูปแบบต้องเป็น เช่น DV-2685'),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9-]{3,80}$/, 'ใช้ได้เฉพาะ a-z 0-9 และขีดกลาง'),
    status: z.enum(['draft', 'published', 'hidden']),

    name: LocalizedTextSchema,
    description: OptionalLocalizedTextSchema.optional(),
    highlights: OptionalLocalizedTextSchema.optional(),

    location: z.object({
      province: z.string().trim().min(1),
      district: z.string().trim().optional(),
      zone: z.string().trim().min(1),
      landmark: z.string().trim().optional(),
      latitude: z.coerce.number().min(-90).max(90).optional(),
      longitude: z.coerce.number().min(-180).max(180).optional(),
      distanceToBeachKm: z.coerce.number().min(0).max(999).optional(),
      googleMapUrl: z.string().trim().url().optional().or(z.literal('')),
    }),

    capacity: z.object({
      bedrooms: z.coerce.number().int().min(1).max(50),
      bathrooms: z.coerce.number().int().min(1).max(50),
      baseGuests: z.coerce.number().int().min(1).max(200),
      maxExtraGuests: z.coerce.number().int().min(0).max(200),
      extraGuestFee: bahtToSatang,
      freeChildUnder10Quota: z.coerce.number().int().min(0).max(50),
    }),

    basePricing: DayRatesSchema,
    baseOverrides: z.array(PriceOverrideSchema).default([]),
    minNights: z.coerce.number().int().min(1).max(30),

    damageDeposit: bahtToSatang,
    depositPercentOverride: z.coerce.number().min(0).max(100).optional(),

    pool: z.object({
      isPrivate: z.coerce.boolean(),
      system: z.enum(['chlorine', 'saltwater']),
      widthM: z.coerce.number().min(0).max(100).optional(),
      lengthM: z.coerce.number().min(0).max(100).optional(),
      depthM: z.coerce.number().min(0).max(10).optional(),
      hasSlider: z.coerce.boolean(),
      sliderHeightM: z.coerce.number().min(0).max(20).optional(),
      hasKidPool: z.coerce.boolean(),
    }),

    amenities: z.array(z.enum(AMENITIES)).default([]),

    bedroomDetails: z
      .array(
        z.object({
          index: z.coerce.number().int().min(1),
          sleeps: z.coerce.number().int().min(1).max(20),
          hasEnsuite: z.coerce.boolean(),
          note: z.string().trim().optional(),
          beds: z
            .array(
              z.object({
                sizeFt: z.coerce.number().min(2).max(8),
                count: z.coerce.number().int().min(1).max(10),
                type: z.enum(['single', 'double', 'bunk', 'extra']),
              }),
            )
            .default([]),
        }),
      )
      .default([]),

    extraMattressSleeps: z.coerce.number().int().min(0).max(50).default(0),

    kitchen: z.object({
      available: z.array(z.string().trim()).default([]),
      unavailable: z.array(z.string().trim()).default([]),
    }),

    rules: z.object({
      checkInFrom: z.string().regex(/^\d{2}:\d{2}$/),
      checkOutBefore: z.string().regex(/^\d{2}:\d{2}$/),
      petAllowed: z.coerce.boolean(),
      loudMusicAllowed: z.coerce.boolean(),
      smokingPolicy: z.enum(['not_allowed', 'outdoor_only', 'allowed']),
      partyPolicy: z.enum(['not_allowed', 'allowed', 'on_request']),
    }),

    parking: z.object({
      inHouse: z.coerce.number().int().min(0).max(100),
      garage: z.coerce.number().int().min(0).max(100),
    }),

    extraCharges: z
      .array(
        z.object({
          key: z.string().trim().min(1),
          label: LocalizedTextSchema,
          price: bahtToSatang,
          unit: z.string().trim().min(1),
        }),
      )
      .default([]),

    additionalNotes: OptionalLocalizedTextSchema.optional(),
  })
  .refine((value) => value.capacity.baseGuests >= value.capacity.bedrooms, {
    message: 'จำนวนคนมาตรฐานต้องไม่น้อยกว่าจำนวนห้องนอน',
    path: ['capacity', 'baseGuests'],
  })
  .refine((value) => !value.pool.hasSlider || value.pool.sliderHeightM !== undefined, {
    message: 'ระบุความสูงสไลเดอร์',
    path: ['pool', 'sliderHeightM'],
  });

export type VillaFormInput = z.input<typeof VillaFormSchema>;
export type VillaFormOutput = z.output<typeof VillaFormSchema>;

/** Filters on the admin villa list, read straight from the URL. */
export const VillaListFiltersSchema = z.object({
  q: z.string().trim().max(80).optional(),
  status: z.enum(['draft', 'published', 'hidden']).optional(),
  zone: z.string().trim().max(60).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

export type VillaListFilters = z.output<typeof VillaListFiltersSchema>;
