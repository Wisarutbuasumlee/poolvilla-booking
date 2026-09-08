import { setRequestLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';

export { generateStaticParams } from '@/i18n/static-params';

export default async function VillasPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('common');

  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="text-2xl font-semibold">{t('nav.villas')}</h1>
      <p className="mt-2 text-[var(--fg-muted)]">Phase 3 builds search, filters and the map view.</p>
    </main>
  );
}
