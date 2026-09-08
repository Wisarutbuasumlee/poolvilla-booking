import type { MetadataRoute } from 'next';
import { connectToDatabase } from '@/lib/db/connect';
import { VillaModel } from '@/lib/db/models/villa';
import { locales, routing } from '@/i18n/routing';

export const dynamic = 'force-dynamic';

/**
 * The sitemap.
 *
 * Only pages worth ranking: the home page, search, the content pages and every
 * published villa. Deliberately absent are the booking flow, the lookup form,
 * and every /a/<code> agent page. Three agents selling the same house would
 * otherwise put three near-identical pages in front of a search engine, and
 * the canonical villa page is the one that should win.
 *
 * Each entry carries its alternates, so a Thai searcher gets the Thai URL and
 * an English one gets the English URL rather than a redirect.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3200').replace(/\/$/, '');

  await connectToDatabase();
  const villas = await VillaModel.find(
    { status: 'published' },
    { code: 1, updatedAt: 1 },
  ).lean();

  const staticPaths = ['', '/villas', '/about', '/contact', '/faq', '/terms', '/privacy'];

  const entries: MetadataRoute.Sitemap = staticPaths.map((path) => ({
    url: `${origin}/${routing.defaultLocale}${path}`,
    changeFrequency: path === '/villas' ? 'daily' : 'weekly',
    priority: path === '' ? 1 : 0.7,
    alternates: { languages: languagesFor(origin, path) },
  }));

  for (const villa of villas) {
    const path = `/villa/${villa.code}`;
    entries.push({
      url: `${origin}/${routing.defaultLocale}${path}`,
      lastModified: villa.updatedAt,
      changeFrequency: 'weekly',
      priority: 0.9,
      alternates: { languages: languagesFor(origin, path) },
    });
  }

  return entries;
}

function languagesFor(origin: string, path: string): Record<string, string> {
  return Object.fromEntries(locales.map((locale) => [locale, `${origin}/${locale}${path}`]));
}
