import { getTranslations } from 'next-intl/server';

export default async function LocaleNotFound() {
  const t = await getTranslations('errors');

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-4">
      <h1 className="text-2xl font-semibold">{t('notFound.title')}</h1>
      <p className="mt-2 text-[var(--fg-muted)]">{t('notFound.body')}</p>
    </main>
  );
}
