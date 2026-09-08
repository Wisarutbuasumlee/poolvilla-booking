import { Geist, Noto_Sans_Thai } from 'next/font/google';
import type { Locale } from './routing';

/**
 * Per-locale font stacks.
 *
 * Latin and Thai load as web fonts. Chinese deliberately does not: a CJK face
 * is several megabytes, and every device that reads this site already ships a
 * good one. Downloading Noto Sans SC would cost more than it buys.
 *
 * The spec names LINE Seed Sans TH as the preferred Thai face. It is not on
 * Google Fonts and has to be self-hosted from LINE's own distribution, so
 * Noto Sans Thai ships now and the swap is a one-line change here once the
 * files are in the repo.
 */

const latin = Geist({
  subsets: ['latin'],
  variable: '--font-latin',
  display: 'swap',
});

const thai = Noto_Sans_Thai({
  subsets: ['thai', 'latin'],
  variable: '--font-thai',
  display: 'swap',
  // Thai UI text lives between regular and semibold; shipping four weights
  // costs more than it earns.
  weight: ['400', '500', '600', '700'],
});

const CJK_STACK =
  "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif";

export function fontClassNames(_locale: Locale): string {
  // Thai glyphs appear in admin content and villa data regardless of the
  // viewing locale, so the Thai variable is always bound.
  return [latin.variable, thai.variable].join(' ');
}

export function fontStackFor(locale: Locale): string {
  if (locale === 'zh') return CJK_STACK;
  return 'var(--font-sans)';
}
