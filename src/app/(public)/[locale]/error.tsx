'use client';

import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

/**
 * The public error boundary.
 *
 * Shows a way forward and nothing else. A stack trace here would tell a guest
 * nothing useful and an attacker something: the digest is enough for staff to
 * find the entry in the server log.
 */
export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors.serverError');

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <AlertTriangle className="h-8 w-8 text-[var(--color-warning)]" aria-hidden />
      <h1 className="text-lg font-semibold">{t('title')}</h1>
      <p className="text-sm text-[var(--fg-muted)]">{t('body')}</p>

      <Button type="button" onClick={reset} className="mt-2">
        {t('retry')}
      </Button>

      {error.digest ? (
        <p className="tnum mt-4 text-xs text-[var(--fg-subtle)]">{error.digest}</p>
      ) : null}
    </main>
  );
}
