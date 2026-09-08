import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';

export { generateStaticParams } from '@/i18n/static-params';

export default async function HomePage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('home');
  const c = await getTranslations('common');

  return (
    <main className="mx-auto max-w-7xl px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('hero.title')}</h1>
      <p className="mt-3 max-w-prose text-[var(--fg-muted)]">{t('hero.subtitle')}</p>

      <p className="mt-10 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 text-sm text-[var(--fg-muted)] shadow-[var(--shadow-card)]">
        Route skeleton only. Phase 3 builds the real first viewport described in the surface brief:
        search box over a full-bleed image, quick-filter chips, then featured villa cards.
      </p>

      <p className="mt-4 text-sm text-[var(--fg-subtle)]">{c('brand')}</p>
    </main>
  );
}
