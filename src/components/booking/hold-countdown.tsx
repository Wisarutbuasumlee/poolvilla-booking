'use client';

import { Timer } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * How long these dates stay held.
 *
 * Counts down from a value the SERVER computed rather than from a timestamp
 * the browser reads, because a phone with a wrong clock would otherwise show a
 * guest either a hold that never ends or one that expired before they saw it.
 *
 * At zero it stops and reloads rather than pretending. The nights really are
 * released at that point, and a page still offering a payment button for them
 * takes money for dates somebody else can already book.
 */
export function HoldCountdown({ seconds, expiredLabel }: { seconds: number; expiredLabel: string }) {
  const t = useTranslations('booking.pay');
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    if (left <= 0) return;
    const timer = setInterval(() => setLeft((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [left]);

  useEffect(() => {
    if (seconds > 0 && left === 0) window.location.reload();
  }, [left, seconds]);

  if (left <= 0) {
    return (
      <p
        role="alert"
        className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]"
      >
        <Timer className="h-4 w-4" aria-hidden />
        {expiredLabel}
      </p>
    );
  }

  const minutes = Math.floor(left / 60);
  const remainder = left % 60;
  // Under five minutes the message changes colour rather than only shrinking,
  // because a number counting down in the corner is easy to miss.
  const urgent = left < 300;

  return (
    <p
      className={cn(
        'flex items-center gap-2 rounded-[var(--radius-md)] p-3 text-sm',
        urgent
          ? 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]'
          : 'bg-[var(--accent-subtle)] text-[var(--fg-default)]',
      )}
      aria-live="polite"
    >
      <Timer className="h-4 w-4 shrink-0" aria-hidden />
      {t('holdRemaining')}{' '}
      <span className="tnum font-semibold">
        {minutes}:{String(remainder).padStart(2, '0')}
      </span>
    </p>
  );
}
