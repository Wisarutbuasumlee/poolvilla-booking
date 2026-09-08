import { z } from 'zod';

/**
 * Booking input.
 *
 * Nothing about money is accepted from the client. The price the browser
 * displayed is sent only so the server can compare it to its own
 * recalculation and warn the guest when the two disagree; it is never used as
 * the amount owed.
 */

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Thai mobile numbers, with or without the punctuation people type. */
const THAI_PHONE = /^0\d{1,2}[-\s]?\d{3}[-\s]?\d{3,4}$/;

export const BookingRequestSchema = z
  .object({
    villaCode: z.string().trim().toUpperCase().max(20),
    checkIn: z.string().regex(DATE_KEY),
    checkOut: z.string().regex(DATE_KEY),

    adults: z.coerce.number().int().min(1).max(60),
    children: z.coerce.number().int().min(0).max(40).default(0),
    childrenUnder10: z.coerce.number().int().min(0).max(40).default(0),

    name: z.string().trim().min(2, 'กรุณากรอกชื่อ').max(120),
    phone: z.string().trim().regex(THAI_PHONE, 'เบอร์โทรไม่ถูกต้อง'),
    email: z.string().trim().toLowerCase().email('อีเมลไม่ถูกต้อง').optional().or(z.literal('')),
    lineId: z.string().trim().max(60).optional(),

    addOns: z
      .array(z.object({ key: z.string().trim().max(40), qty: z.coerce.number().int().min(1).max(50) }))
      .max(20)
      .default([]),

    promoCode: z.string().trim().toUpperCase().max(30).optional().or(z.literal('')),

    /** What the browser showed, in satang. Compared, never trusted. */
    displayedTotal: z.coerce.number().int().min(0).optional(),

    acceptedTerms: z.literal('true', { message: 'กรุณายอมรับเงื่อนไข' }),
  })
  .refine((value) => value.checkOut > value.checkIn, {
    message: 'วันออกต้องหลังวันเข้าพัก',
    path: ['checkOut'],
  })
  .refine((value) => value.childrenUnder10 <= value.children, {
    message: 'เด็กต่ำกว่า 10 ขวบต้องไม่มากกว่าจำนวนเด็กทั้งหมด',
    path: ['childrenUnder10'],
  })
  .refine((value) => Boolean(value.email) || Boolean(value.lineId), {
    // Staff need a way back to the guest that is not only a phone call.
    message: 'กรุณากรอกอีเมลหรือไอดีไลน์อย่างน้อยหนึ่งอย่าง',
    path: ['lineId'],
  });

export type BookingRequest = z.output<typeof BookingRequestSchema>;

export const BookingLookupSchema = z.object({
  bookingNo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^BK-\d{8}-\d{4}$/, 'เลขที่จองไม่ถูกต้อง'),
  phone: z.string().trim().regex(THAI_PHONE, 'เบอร์โทรไม่ถูกต้อง'),
});

/** Normalises a typed phone number so lookups match what was stored. */
export function normalisePhone(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}
