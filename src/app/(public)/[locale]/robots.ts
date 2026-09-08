import type { MetadataRoute } from 'next';

/**
 * Crawler rules.
 *
 * The disallow list is not about secrecy: every one of those paths is either
 * personal, single-use, or a duplicate of a page that should rank instead.
 * Indexing them wastes crawl budget on URLs that can never be a useful search
 * result, and in the case of a booking, publishes a stranger's travel dates.
 */
export default function robots(): MetadataRoute.Robots {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3200').replace(/\/$/, '');

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        // Personal, and reachable only by booking number.
        '/th/booking/',
        '/en/booking/',
        '/zh/booking/',
        // One page per agent per villa is duplicate content; the canonical
        // villa page is the one that should rank.
        '/th/a/',
        '/en/a/',
        '/zh/a/',
      ],
    },
    sitemap: `${origin}/th/sitemap.xml`,
  };
}
