'use client';

import { Globe } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { locales, type Locale } from '@/i18n/routing';

const LABELS: Record<Locale, string> = {
  th: 'ไทย',
  en: 'English',
  zh: '中文',
};

/**
 * Switches locale while staying on the same page.
 *
 * usePathname from @/i18n/navigation returns the path WITHOUT the locale
 * prefix, which is why the switch can just re-push it under a new locale. The
 * bare next/navigation version would return the prefixed path and produce
 * /en/th/villas.
 */
export function LocaleSwitcher() {
  const t = useTranslations('common.language');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();

  const [pending, startTransition] = useTransition();

  return (
    <label className="relative inline-flex items-center">
      <Globe
        className="pointer-events-none absolute left-2.5 h-4 w-4 text-[var(--fg-subtle)]"
        aria-hidden
      />
      <span className="sr-only">{t('label')}</span>
      <select
        value={locale}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value as Locale;
          startTransition(() => {
            // With no `pathnames` map in the routing config, usePathname
            // already returns the current path with its dynamic segments
            // filled in and the locale prefix stripped, so this keeps the
            // visitor on the same villa or booking.
            router.replace(pathname, { locale: next });
          });
        }}
        className="h-9 appearance-none rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] py-0 pl-8 pr-7 text-sm text-[var(--fg-default)] hover:border-[var(--border-strong)]"
      >
        {locales.map((value) => (
          <option key={value} value={value}>
            {LABELS[value]}
          </option>
        ))}
      </select>
    </label>
  );
}
