import { defineRouting } from 'next-intl/routing';

export const locales = ['th', 'en', 'zh'] as const;
export type Locale = (typeof locales)[number];

export const routing = defineRouting({
  locales,
  defaultLocale: 'th',
  // Always prefixed. A bare /villa/DV-2685 would otherwise render Thai at a
  // URL that never says so, which breaks hreflang and shared links.
  localePrefix: 'always',
  localeDetection: true,
});
