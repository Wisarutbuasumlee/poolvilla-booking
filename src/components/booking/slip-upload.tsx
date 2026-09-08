'use client';

import { CheckCircle2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState, useTransition } from 'react';
import { uploadSlipAction } from '@/lib/booking/slip-actions';
import { Button } from '@/components/ui/button';

/**
 * Uploading a payment slip.
 *
 * A guest on a phone photographs the slip and sends it. The whole interaction
 * is one button, and the file input is hidden behind it, because a bare file
 * input is the least legible control on mobile.
 *
 * Success does not claim the booking is confirmed. Staff still compare the
 * slip to the amount, and saying "confirmed" here would be a promise the
 * system has not made.
 */
export function SlipUpload({ bookingNo, alreadyUploaded }: { bookingNo: string; alreadyUploaded: boolean }) {
  const t = useTranslations('booking.pay');
  const [done, setDone] = useState(alreadyUploaded);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  function upload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;

    const payload = new FormData();
    payload.append('slip', file);

    startTransition(async () => {
      const result = await uploadSlipAction(bookingNo, payload);
      if (result.ok) {
        setDone(true);
        setError(null);
      } else {
        setError(result.message);
      }
    });
  }

  if (done) {
    return (
      <p className="flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--color-success)]/10 p-3 text-sm text-[var(--color-success)]">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        {t('uploaded')}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        size="lg"
        block
        disabled={pending}
        onClick={() => input.current?.click()}
      >
        <Upload className="h-4 w-4" aria-hidden />
        {pending ? t('uploading') : t('uploadSlip')}
      </Button>

      <input
        ref={input}
        type="file"
        // capture lets a phone open the camera straight away, which is what a
        // guest standing in their banking app actually wants.
        accept="image/*"
        capture="environment"
        hidden
        onChange={(event) => upload(event.target.files)}
      />

      <p className="text-sm text-[var(--fg-muted)]">{t('slipHint')}</p>

      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
