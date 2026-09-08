'use server';

import { revalidatePath } from 'next/cache';
import { Types } from 'mongoose';

import { connectToDatabase } from '@/lib/db/connect';
import { BookingModel } from '@/lib/db/models/booking';
import { AuditLogModel } from '@/lib/db/models/reference';
import { VillaModel } from '@/lib/db/models/villa';
import { confirmHold, releaseHold } from '@/lib/availability/service';
import { requireRole, type Actor } from '@/lib/auth/rbac';

/**
 * Back-office booking operations.
 *
 * These move money and the shared calendar, so every one of them writes an
 * audit entry and every one re-checks the role. Only the office confirms and
 * cancels; an agent seeing a slip is not the same as an agent deciding the
 * money arrived.
 */

export type BookingActionResult = { ok: true } | { ok: false; message: string };

/**
 * Confirms a booking after staff have checked the slip.
 *
 * The hold must still be live. That guard is what makes this safe against the
 * sweeper running in the same second: whichever conditional update lands first
 * wins, and the loser sees zero modified documents and stops. Forcing it
 * through would confirm dates that had just been released to somebody else.
 */
export async function confirmBookingAction(bookingId: string): Promise<BookingActionResult> {
  const actor = await requireRole('superadmin', 'staff');
  await connectToDatabase();

  const id = new Types.ObjectId(bookingId);

  const booking = await BookingModel.findOneAndUpdate(
    {
      _id: id,
      status: 'awaiting_payment',
      $or: [{ holdExpiresAt: { $gt: new Date() } }, { holdExpiresAt: null }],
    },
    {
      $set: { status: 'confirmed', 'payment.depositStatus': 'paid', 'payment.depositPaidAt': new Date() },
      $unset: { holdExpiresAt: '' },
      $push: { timeline: { at: new Date(), by: actor.name, action: 'confirmed' } },
    },
    { new: true },
  );

  if (!booking) {
    return {
      ok: false,
      message: 'การจองนี้หมดเวลากันวันแล้วหรือถูกเปลี่ยนสถานะไปแล้ว กรุณารีเฟรชแล้วตรวจสอบวันว่างอีกครั้ง',
    };
  }

  await confirmHold(id);
  await VillaModel.updateOne({ _id: booking.villaId }, { $inc: { 'stats.bookingCount': 1 } });
  await audit(actor, 'booking.confirm', bookingId, { bookingNo: booking.bookingNo });

  revalidatePath('/admin/bookings');
  revalidatePath('/admin');
  return { ok: true };
}

/** Rejects a slip without cancelling: the guest can send a correct one. */
export async function rejectSlipAction(
  bookingId: string,
  reason: string,
): Promise<BookingActionResult> {
  const actor = await requireRole('superadmin', 'staff');
  await connectToDatabase();

  const result = await BookingModel.updateOne(
    { _id: new Types.ObjectId(bookingId) },
    {
      $set: { 'payment.depositStatus': 'rejected' },
      $push: {
        timeline: { at: new Date(), by: actor.name, action: 'slip_rejected', detail: reason },
      },
    },
  );

  if (result.matchedCount === 0) return { ok: false, message: 'ไม่พบการจอง' };

  await audit(actor, 'booking.slip.reject', bookingId, { reason });
  revalidatePath('/admin/bookings');
  return { ok: true };
}

/**
 * Cancels a booking and frees its nights.
 *
 * The reason is required. A cancelled booking with no reason is a question
 * somebody will ask months later and nobody will be able to answer.
 */
export async function cancelBookingAction(
  bookingId: string,
  reason: string,
): Promise<BookingActionResult> {
  const actor = await requireRole('superadmin', 'staff');
  await connectToDatabase();

  if (reason.trim().length < 3) return { ok: false, message: 'กรุณาระบุเหตุผลการยกเลิก' };

  const id = new Types.ObjectId(bookingId);
  const booking = await BookingModel.findById(id).lean();
  if (!booking) return { ok: false, message: 'ไม่พบการจอง' };

  if (['cancelled', 'completed'].includes(booking.status)) {
    return { ok: false, message: 'การจองนี้ถูกปิดไปแล้ว' };
  }

  await BookingModel.updateOne(
    { _id: id },
    {
      $set: {
        status: 'cancelled',
        cancellation: { reason, at: new Date(), by: new Types.ObjectId(actor.id) },
      },
      $unset: { holdExpiresAt: '' },
      $push: { timeline: { at: new Date(), by: actor.name, action: 'cancelled', detail: reason } },
    },
  );

  // Release held nights and delete booked ones, so the villa can be sold
  // again immediately rather than waiting for anybody to notice.
  await releaseHold(id);
  const { AvailabilityModel } = await import('@/lib/db/models/availability');
  await AvailabilityModel.deleteMany({ bookingId: id });

  await audit(actor, 'booking.cancel', bookingId, { bookingNo: booking.bookingNo, reason });
  revalidatePath('/admin/bookings');
  revalidatePath('/admin/calendar');
  return { ok: true };
}

/** Records the remaining balance as paid, usually at check-in. */
export async function markBalancePaidAction(bookingId: string): Promise<BookingActionResult> {
  const actor = await requireRole('superadmin', 'staff');
  await connectToDatabase();

  const result = await BookingModel.updateOne(
    { _id: new Types.ObjectId(bookingId), status: { $in: ['confirmed', 'checked_in'] } },
    {
      $set: { 'payment.balanceStatus': 'paid', 'payment.balancePaidAt': new Date() },
      $push: { timeline: { at: new Date(), by: actor.name, action: 'balance_paid' } },
    },
  );

  if (result.matchedCount === 0) return { ok: false, message: 'สถานะการจองไม่รองรับการรับยอดคงเหลือ' };

  await audit(actor, 'booking.balance.paid', bookingId, null);
  revalidatePath('/admin/bookings');
  return { ok: true };
}

/** Moves a booking along its lifecycle: checked in, then completed. */
export async function setBookingStatusAction(
  bookingId: string,
  status: 'checked_in' | 'completed' | 'no_show',
): Promise<BookingActionResult> {
  const actor = await requireRole('superadmin', 'staff');
  await connectToDatabase();

  const result = await BookingModel.updateOne(
    { _id: new Types.ObjectId(bookingId), status: { $in: ['confirmed', 'checked_in'] } },
    {
      $set: { status },
      $push: { timeline: { at: new Date(), by: actor.name, action: status } },
    },
  );

  if (result.matchedCount === 0) return { ok: false, message: 'เปลี่ยนสถานะจากสถานะปัจจุบันไม่ได้' };

  await audit(actor, `booking.${status}`, bookingId, null);
  revalidatePath('/admin/bookings');
  return { ok: true };
}

async function audit(actor: Actor, action: string, entityId: string, after: unknown) {
  await AuditLogModel.create({
    actorId: new Types.ObjectId(actor.id),
    actorLabel: `${actor.name} <${actor.email}>`,
    action,
    entity: 'booking',
    entityId,
    after,
  }).catch(() => {
    // Never let an audit write fail the operation it records.
  });
}
