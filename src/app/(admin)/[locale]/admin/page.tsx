import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';

export { generateStaticParams } from '@/i18n/static-params';

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin');

  return (
    <div>
      <h1 className="text-xl font-semibold">{t('nav.dashboard')}</h1>
      <p className="mt-2 text-sm text-[var(--fg-muted)]">
        Phase 6 fills this with KPI cards, revenue charts and the agent breakdown.
      </p>
    </div>
  );
}
