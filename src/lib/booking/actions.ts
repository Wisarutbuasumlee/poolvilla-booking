'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Types } from 'mongoose';

import { connectToDatabase } from '@/lib/db/connect';
import { withTransaction } from '@/lib/db/session';
import { BookingModel } from '@/lib/db/models/booking';
import { PromotionModel, SettingModel } from '@/lib/db/models/reference';
import { VillaModel } from '@/lib/db/models/villa';
import { holdNights, releaseHold } from '@/lib/availability/service';
import { getPricingContext } from '@/lib/rates/context';
import { getHolidaySet, getRateCard, villaCapacity, type VillaRateSource } from '@/lib/rates/rate-cards';
import { asDateKey, quote, todayBangkok, type Promotion, type Satang } from '@/lib/pricing';
import { notifyStaff } from '@/lib/notify';
import { BookingRequestSchema } from '@/lib/validation/booking';
import { clientIdentifier, rateLimit } from '@/lib/rate-limit';
import { nextBookingNo } from './number';
import { serialiseQuote, serialiseRateCard } from './snapshot';

/**
 * Creating a booking.
 *
 * The order matters and is not negotiable:
 *
 *   1. validate the request
 *   2. re-resolve the rate card from the referral COOKIE, never from the form
 *   3. price it server-side
 *   4. compare against what the browser displayed
 *   5. claim the nights
 *   6. write the booking
 *
 * Steps 2 and 3 exist because a Server Action is a public endpoint. A price
 * posted by the client is a number an attacker chose.
 */

export type BookingResult =
  | { ok: true; bookingNo: string }
  | { ok: false; code: 'INVALID'; errors: Record<string, string> }
  | { ok: false; code: 'UNAVAILABLE'; conflictingDates: string[] }
  | { ok: false; code: 'NOT_BOOKABLE'; message: string }
  | { ok: false; code: 'PRICE_CHANGED'; newTotal: number }
  | { ok: false; code: 'ERROR'; message: string };

export async function createBookingAction(formData: FormData): Promise<BookingResult> {
  // Ten in ten minutes is far more than any real guest needs and far less than
  // a script would want. Without it one loop could hold every night on every
  // villa for half an hour at a time.
  const limit = await rateLimit('booking', await clientIdentifier(), 10, 600);
  if (!limit.allowed) {
    return {
      ok: false,
      code: 'ERROR',
      message: `ทำรายการถี่เกินไป กรุณารออีก ${Math.ceil(limit.retryAfter / 60)} นาที`,
    };
  }

  await connectToDatabase();

  const parsed = BookingRequestSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      errors[issue.path.map(String).join('.')] ??= issue.message;
    }
    return { ok: false, code: 'INVALID', errors };
  }

  const request = parsed.data;
  const checkIn = asDateKey(request.checkIn);
  const checkOut = asDateKey(request.checkOut);

  // Nobody books yesterday. The calendar already hides past nights, so this
  // only catches a hand-edited form.
  if (checkIn < todayBangkok()) {
    return { ok: false, code: 'NOT_BOOKABLE', message: 'วันเข้าพักผ่านไปแล้ว' };
  }

  const villa = await VillaModel.findOne({ code: request.villaCode, status: 'published' }).lean();
  if (!villa) return { ok: false, code: 'ERROR', message: 'ไม่พบบ้านหลังนี้' };

  const source = villa as unknown as VillaRateSource;
  const context = await getPricingContext();

  const [rateCard, holidays, settings] = await Promise.all([
    getRateCard(source, context),
    getHolidaySet(checkIn, checkOut),
    SettingModel.findById('site').lean(),
  ]);

  const promotion = await resolvePromotion(request.promoCode, villa._id);
  const addOns = resolveAddOns(villa.extraCharges ?? [], request.addOns);

  const priced = quote({
    checkIn,
    checkOut,
    rateCard,
    capacity: villaCapacity(source),
    holidays,
    guests: {
      adults: request.adults,
      children: request.children,
      childrenUnder10: request.childrenUnder10,
    },
    addOns,
    promotion,
    settings: {
      depositPercent: settings?.depositPercent ?? 30,
      currency: 'THB',
    },
  });

  if (!priced.isBookable) {
    const first = priced.violations[0];
    return {
      ok: false,
      code: 'NOT_BOOKABLE',
      message: violationMessage(first?.code, first?.meta),
    };
  }

  // The guest agreed to a number. If the server arrives at a different one,
  // taking their money on the new figure without saying so is not acceptable.
  if (
    request.displayedTotal !== undefined &&
    request.displayedTotal > 0 &&
    request.displayedTotal !== priced.grandTotal
  ) {
    return { ok: false, code: 'PRICE_CHANGED', newTotal: priced.grandTotal };
  }

  const holdMinutes = settings?.holdMinutes ?? Number(process.env.BOOKING_HOLD_MINUTES ?? 30);
  let bookingNo: string | null = null;
  let heldBookingId: Types.ObjectId | null = null;

  try {
    const outcome = await withTransaction(async (session) => {
      const hold = await holdNights(
        { villaId: villa._id, checkIn, checkOut, holdMinutes, source: 'web' },
        session,
      );

      if (!hold.ok) return hold;
      heldBookingId = hold.bookingId;

      const number = await nextBookingNo(session);

      await BookingModel.create(
        [
          {
            // The hold token IS the booking id, so every calendar row says
            // which booking owns it from the moment it is written.
            _id: hold.bookingId,
            bookingNo: number,
            villaId: villa._id,
            villaCodeSnapshot: villa.code,
            agentId: rateCard.agentId ? new Types.ObjectId(rateCard.agentId) : null,
            agentCodeSnapshot: rateCard.agentCode,
            customer: {
              name: request.name,
              phone: request.phone,
              email: request.email || undefined,
              lineId: request.lineId || undefined,
            },
            checkIn,
            checkOut,
            nights: priced.nights,
            guests: {
              adults: request.adults,
              children: request.children,
              childrenUnder10: request.childrenUnder10,
              totalGuests: priced.guests.total,
              extraGuests: priced.guests.extraGuests,
            },
            priceBreakdown: serialiseQuote(priced),
            rateCardSnapshot: serialiseRateCard(rateCard),
            pricingEngineVersion: priced.engineVersion,
            commission: priced.commission,
            status: 'awaiting_payment',
            holdExpiresAt: hold.holdExpiresAt,
            source: rateCard.agentCode ? 'agent_link' : 'web',
            timeline: [{ at: new Date(), by: 'guest', action: 'created' }],
          },
        ],
        { ...(session ? { session } : {}), ordered: true },
      );

      bookingNo = number;
      return { ok: true as const };
    });

    if (!outcome.ok) {
      return outcome.reason === 'CONFLICT'
        ? { ok: false, code: 'UNAVAILABLE', conflictingDates: outcome.conflictingDates }
        : { ok: false, code: 'NOT_BOOKABLE', message: 'ช่วงวันที่เลือกไม่ถูกต้อง' };
    }
  } catch (error) {
    // Without a transaction the hold has already landed. Releasing it here is
    // what stops a failed write leaving nights blocked for half an hour.
    if (heldBookingId) await releaseHold(heldBookingId).catch(() => {});
    return {
      ok: false,
      code: 'ERROR',
      message: error instanceof Error ? error.message : 'บันทึกการจองไม่สำเร็จ',
    };
  }

  if (!bookingNo) return { ok: false, code: 'ERROR', message: 'บันทึกการจองไม่สำเร็จ' };

  // Fire and forget. A notification that fails must never fail the booking.
  void notifyStaff({
    title: `จองใหม่ ${bookingNo}`,
    lines: [
      `${villa.code} ${villa.name?.th ?? ''}`,
      `${checkIn} ถึง ${checkOut} (${priced.nights} คืน)`,
      `${request.name} ${request.phone}`,
      `ยอดรวม ${(priced.grandTotal / 100).toLocaleString('en-US')} บาท`,
      rateCard.agentCode ? `นายหน้า ${rateCard.agentCode}` : 'ไม่มีนายหน้า',
    ],
  });

  redirect(`/${await getLocale()}/booking/pay/${bookingNo}`);
}

// ---------------------------------------------------------------------------

async function resolvePromotion(
  code: string | undefined,
  villaId: Types.ObjectId,
): Promise<Promotion | null> {
  if (!code) return null;

  const today = todayBangkok();
  const promotion = await PromotionModel.findOne({
    code,
    isActive: true,
    $and: [
      { $or: [{ startsAt: { $exists: false } }, { startsAt: null }, { startsAt: { $lte: today } }] },
      { $or: [{ endsAt: { $exists: false } }, { endsAt: null }, { endsAt: { $gte: today } }] },
    ],
  }).lean();

  if (!promotion) return null;
  // A code limited to certain villas must not apply to the others.
  if (promotion.villaIds?.length && !promotion.villaIds.some((id) => id.equals(villaId))) {
    return null;
  }
  if (promotion.usageLimit && (promotion.usageCount ?? 0) >= promotion.usageLimit) return null;

  const base = {
    code: promotion.code,
    ...(promotion.minNights ? { minNights: promotion.minNights } : {}),
    ...(promotion.minSubtotal ? { minSubtotal: promotion.minSubtotal as Satang } : {}),
  };

  return promotion.kind === 'percent'
    ? {
        ...base,
        kind: 'percent',
        value: promotion.value,
        appliesTo: (promotion.appliesTo as 'accommodation' | 'subtotal') ?? 'subtotal',
        ...(promotion.maxDiscount ? { maxDiscount: promotion.maxDiscount as Satang } : {}),
      }
    : { ...base, kind: 'fixed', value: promotion.value as Satang, appliesTo: 'subtotal' };
}

/**
 * Prices add-ons from the VILLA record, using only the quantity the guest
 * chose. The form posts a key and a count; the unit price comes from the
 * database, never from the request.
 */
function resolveAddOns(
  available: { key: string; label?: { th: string }; price: number; unit: string }[],
  requested: { key: string; qty: number }[],
) {
  const byKey = new Map(available.map((charge) => [charge.key, charge]));

  return requested
    .map((entry) => {
      const charge = byKey.get(entry.key);
      if (!charge) return null;
      return {
        key: charge.key,
        label: charge.label?.th ?? charge.key,
        qty: entry.qty,
        unitPrice: charge.price as Satang,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

function violationMessage(code: string | undefined, meta: Record<string, unknown> = {}): string {
  switch (code) {
    case 'MIN_NIGHTS':
      return `ช่วงวันที่เลือกต้องเข้าพักอย่างน้อย ${meta.required} คืน`;
    case 'OVER_CAPACITY':
      return `บ้านหลังนี้รับได้สูงสุด ${meta.maximum} คน`;
    case 'PROMO_MIN_NIGHTS':
      return `โค้ดส่วนลดนี้ต้องเข้าพักอย่างน้อย ${meta.required} คืน`;
    case 'PROMO_MIN_SUBTOTAL':
      return 'ยอดยังไม่ถึงขั้นต่ำของโค้ดส่วนลด';
    default:
      return 'ไม่สามารถจองช่วงวันนี้ได้';
  }
}

function readForm(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (value instanceof File) continue;
    if (key.startsWith('$ACTION') || key.endsWith('Json')) continue;
    out[key] = value;
  }

  const addOns = formData.get('addOnsJson');
  if (typeof addOns === 'string' && addOns) {
    try {
      out.addOns = JSON.parse(addOns);
    } catch {
      out.addOns = [];
    }
  }

  return out;
}
