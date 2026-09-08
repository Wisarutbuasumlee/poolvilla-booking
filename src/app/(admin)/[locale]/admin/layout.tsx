import '@/styles/globals.css';

import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
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

  return (
    <html lang={locale} className={fontClassNames(locale)} suppressHydrationWarning>
      <body className="min-h-dvh bg-[var(--bg-page)] antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {/* No chrome here. The signed-in shell supplies its own, and the
              sign-in page is deliberately a bare centred card, so anything
              added at this level would appear on both and belong to neither. */}
          <NextIntlClientProvider>{children}</NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
