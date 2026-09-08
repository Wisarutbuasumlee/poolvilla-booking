import { setRequestLocale, getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';

export { generateStaticParams } from '@/i18n/static-params';

export default async function AdminBookingsPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin');

  return (
    <div>
      <h1 className="text-xl font-semibold">{t('nav.bookings')}</h1>
      <p className="mt-2 text-sm text-[var(--fg-muted)]">
        Phase 4 fills this with the booking table, the status board and slip verification.
      </p>
    </div>
  );
}
