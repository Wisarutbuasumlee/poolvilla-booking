import '@/styles/globals.css';

import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { ThemeProvider } from '@/components/common/theme-provider';
import { ContactBar } from '@/components/public/contact-bar';
import { SiteFooter } from '@/components/public/site-footer';
import { SiteHeader } from '@/components/public/site-header';
import { fontClassNames } from '@/i18n/fonts';
import { routing, type Locale } from '@/i18n/routing';

export { generateStaticParams } from '@/i18n/static-params';

/**
 * Root layout for the PUBLIC surface.
 *
 * There are two root layouts in this app, one per surface, which is why there
 * is deliberately no src/app/layout.tsx. Adding one would wrap both and
 * produce nested <html> elements. The two surfaces are on different hostnames
 * and are never client-side navigated between, so they gain nothing from a
 * shared root and lose the ability to have different chrome and metadata.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'common' });

  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3200'),
    title: { default: `${t('brand')} — ${t('tagline')}`, template: `%s · ${t('brand')}` },
    description: t('tagline'),
  };
}

export default async function PublicRootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  // Must be the first statement that touches the locale, or next-intl forces
  // this whole subtree to render dynamically.
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'common' });
  const skipLabel = t('skipToContent');

  return (
    <html lang={locale} className={fontClassNames(locale)} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <NextIntlClientProvider>
            {/* First thing in the tab order. Every page here starts with a
                header and a search box, and a keyboard user should not have to
                pass through them to reach the villa they came for. */}
            <a
              href="#content"
              className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-[var(--radius-md)] focus:bg-[var(--bg-surface)] focus:px-4 focus:py-2 focus:shadow-[var(--shadow-float)]"
            >
              {skipLabel}
            </a>

            <SiteHeader />
            <div id="content">{children}</div>
            <SiteFooter />

            {/* Reachable from every page. Most Thai guests decide on LINE,
                and a contact button that scrolls away is a lost booking. */}
            <ContactBar />
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
