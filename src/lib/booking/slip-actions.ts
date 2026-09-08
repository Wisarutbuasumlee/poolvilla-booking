'use server';

import { revalidatePath } from 'next/cache';
import sharp from 'sharp';
import { connectToDatabase } from '@/lib/db/connect';
import { BookingModel } from '@/lib/db/models/booking';
import { contentKey, localStorage } from '@/lib/storage/local';
import { notifyStaff } from '@/lib/notify';
import { clientIdentifier, rateLimit } from '@/lib/rate-limit';

/**
 * Uploading a payment slip.
 *
 * A slip is a photograph of a bank transfer, so it is treated as untrusted
 * input twice over: the file header decides whether it is really an image, and
 * it is re-encoded rather than stored as received. Re-encoding strips EXIF,
 * which on a phone photo carries the GPS coordinates of wherever the guest was
 * standing, and it neutralises anything hidden in the original container.
 *
 * The booking is NOT confirmed here. Staff compare the slip to the amount and
 * confirm it in the back office; an automatic confirmation on upload would
 * accept a screenshot of somebody else's transfer.
 */

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);

export type SlipResult = { ok: true } | { ok: false; message: string };

export async function uploadSlipAction(bookingNo: string, formData: FormData): Promise<SlipResult> {
  // Each upload writes a re-encoded image to disk. Twenty in ten minutes
  // covers a guest whose first few photographs came out unreadable, and stops
  // a script filling the volume.
  const limit = await rateLimit('slip', await clientIdentifier(), 20, 600);
  if (!limit.allowed) {
    return { ok: false, message: 'อัปโหลดถี่เกินไป กรุณารอสักครู่แล้วลองใหม่' };
  }

  await connectToDatabase();

  const file = formData.get('slip');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: 'กรุณาเลือกไฟล์สลิป' };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, message: 'ไฟล์ใหญ่เกิน 8 MB' };
  }
  if (!ACCEPTED.has(file.type)) {
    return { ok: false, message: 'รองรับเฉพาะรูปภาพ JPEG, PNG, WebP และ HEIC' };
  }

  const booking = await BookingModel.findOne({ bookingNo }).lean();
  if (!booking) return { ok: false, message: 'ไม่พบเลขที่จองนี้' };

  // A slip against a cancelled or expired booking is a guest who paid for
  // dates that are gone. It has to reach staff, not be silently accepted.
  if (['cancelled', 'expired', 'no_show'].includes(booking.status)) {
    return {
      ok: false,
      message: 'การจองนี้หมดอายุหรือถูกยกเลิกแล้ว กรุณาติดต่อเจ้าหน้าที่ก่อนโอนเงิน',
    };
  }

  // A booking without a price breakdown cannot have a deposit to pay, so it
  // is not something a guest could have reached this page from.
  const depositRequired = booking.priceBreakdown?.depositRequired ?? 0;

  let webp: Buffer;
  try {
    webp = await sharp(Buffer.from(await file.arrayBuffer()), { failOn: 'error' })
      .rotate()
      // Wide enough to read the amount and the reference, small enough that a
      // staff member on a phone can open it instantly.
      .resize({ width: 1400, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return { ok: false, message: 'อ่านไฟล์รูปไม่ได้ กรุณาลองใหม่' };
  }

  const stored = await localStorage.put(
    contentKey(`slips/${bookingNo}`, webp, '.webp'),
    webp,
    'image/webp',
  );

  const url = localStorage.urlFor(stored.key);

  await BookingModel.updateOne(
    { _id: booking._id },
    {
      $push: {
        'payment.slips': { url, amount: depositRequired },
        timeline: { at: new Date(), by: 'guest', action: 'slip_uploaded' },
      },
      $set: { 'payment.depositStatus': 'pending_review' },
    },
  );

  void notifyStaff({
    title: `สลิปใหม่ ${bookingNo}`,
    lines: [
      `${booking.villaCodeSnapshot} ${booking.checkIn} ถึง ${booking.checkOut}`,
      `${booking.customer?.name} ${booking.customer?.phone}`,
      `มัดจำ ${(depositRequired / 100).toLocaleString('en-US')} บาท`,
    ],
  });

  revalidatePath(`/booking/pay/${bookingNo}`);
  return { ok: true };
}
