import '@/styles/globals.css';

import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { ThemeProvider } from '@/components/common/theme-provider';
import { fontClassNames } from '@/i18n/fonts';
import { routing, type Locale } from '@/i18n/routing';

export { generateStaticParams } from '@/i18n/static-params';

/**
 * Root layout for the ADMIN surface, reached at admin.<host> and rewritten to
 * this path by src/proxy.ts.
 *
 * This layout deliberately does NOT check authentication. The sign-in page
 * lives inside this tree and has to render without a session. Phase 2 adds a
 * nested (protected)/layout.tsx that wraps everything except login and holds
 * the role check.
 *
 * Admin is never indexed and never prerendered for the public.
 */

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AdminRootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'common' });

  return (
    <html lang={locale} className={fontClassNames(locale)} suppressHydrationWarning>
      <body className="min-h-dvh bg-[var(--bg-sunken)] antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <NextIntlClientProvider>
            <div className="mx-auto max-w-7xl px-4 py-8">
              <p className="mb-6 text-xs font-medium uppercase tracking-wider text-[var(--fg-subtle)]">
                {t('brand')} · admin
              </p>
              {children}
            </div>
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
