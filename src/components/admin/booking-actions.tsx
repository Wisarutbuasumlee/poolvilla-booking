'use client';

import { Check, LogIn, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import {
  cancelBookingAction,
  confirmBookingAction,
  markBalancePaidAction,
  setBookingStatusAction,
} from '@/lib/booking/admin-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';

/**
 * The buttons on one booking row.
 *
 * Cancelling asks for a reason inline rather than in a dialog. A confirm
 * dialog trains people to click through it; a field they have to type into
 * makes the destructive action deliberate, and the reason is the thing
 * somebody will want months later.
 */
export function BookingActions({
  bookingId,
  status,
  depositStatus,
  balanceStatus,
}: {
  bookingId: string;
  status: string;
  depositStatus: string;
  balanceStatus: string;
}) {
  const t = useTranslations('admin.bookings');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    startTransition(async () => {
      const result = await action();
      setError(result.ok ? null : (result.message ?? t('failed')));
      if (result.ok) setCancelling(false);
    });
  }

  const closed = ['cancelled', 'completed', 'expired', 'no_show'].includes(status);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {status === 'awaiting_payment' ? (
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => run(() => confirmBookingAction(bookingId))}
          >
            <Check className="h-4 w-4" aria-hidden />
            {depositStatus === 'pending_review' ? t('confirmSlip') : t('confirm')}
          </Button>
        ) : null}

        {status === 'confirmed' ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => run(() => setBookingStatusAction(bookingId, 'checked_in'))}
          >
            <LogIn className="h-4 w-4" aria-hidden />
            {t('checkIn')}
          </Button>
        ) : null}

        {status === 'checked_in' ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => run(() => setBookingStatusAction(bookingId, 'completed'))}
          >
            {t('complete')}
          </Button>
        ) : null}

        {!closed && balanceStatus !== 'paid' ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => run(() => markBalancePaidAction(bookingId))}
          >
            {t('balancePaid')}
          </Button>
        ) : null}

        {!closed ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-[var(--color-danger)]"
            disabled={pending}
            onClick={() => setCancelling((on) => !on)}
          >
            <X className="h-4 w-4" aria-hidden />
            {t('cancel')}
          </Button>
        ) : null}
      </div>

      {cancelling ? (
        <div className="flex flex-wrap gap-2">
          <Input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t('cancelReason')}
            className="h-9 flex-1"
            autoFocus
          />
          <Button
            type="button"
            size="sm"
            variant="danger"
            disabled={pending || reason.trim().length < 3}
            onClick={() => run(() => cancelBookingAction(bookingId, reason))}
          >
            {t('confirmCancel')}
          </Button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
