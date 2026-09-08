import { ArrowRight } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import Image from 'next/image';
import { Suspense } from 'react';

import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { getFeaturedVillas, getPublicZones } from '@/lib/villas/public-queries';
import { SearchBox } from '@/components/public/search-box';
import { VillaCard } from '@/components/public/villa-card';
import { Skeleton } from '@/components/ui/surface';

export { generateStaticParams } from '@/i18n/static-params';

/**
 * The home page.
 *
 * Its one job is to get the visitor to a villa that is free on their dates,
 * as fast as possible. The search box sits over the first image rather than
 * below three screens of brochure copy, because the direction contract for
 * this surface refuses the resort-brochure arrangement.
 *
 * The quick filters are links, not client state. Each one is a real URL a
 * guest can send to the group chat.
 */

const QUICK_FILTERS = [
  { key: 'slider', amenity: 'pool_slide' },
  { key: 'karaoke', amenity: 'karaoke' },
  { key: 'snooker', amenity: 'snooker' },
] as const;

export default async function HomePage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('home');
  const common = await getTranslations('common');
  const zones = await getPublicZones();

  return (
    <main>
      <section className="relative">
        {/* The hero is one image at the scale the product actually has in
            life. A pool villa is sold on the pool. */}
        {/* Shorter on a phone so the search box clears the floating LINE and
            call buttons. At 62vh the search button sat directly under them and
            a thumb aiming for it could hit LINE instead. */}
        <div className="relative h-[46vh] min-h-[320px] w-full overflow-hidden bg-[var(--bg-sunken)] sm:h-[62vh] sm:min-h-[420px]">
          <Image
            src="/api/uploads/villas/DV-2685/placeholder-1-1280.webp"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
            unoptimized
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/25 to-black/55" />

          <div className="absolute inset-x-0 top-1/2 mx-auto max-w-3xl -translate-y-1/2 px-4 text-center text-white">
            <h1 className="text-2xl font-semibold leading-tight drop-shadow sm:text-4xl">
              {t('hero.title')}
            </h1>
            <p className="mt-3 text-sm opacity-90 drop-shadow sm:text-base">{t('hero.subtitle')}</p>
          </div>
        </div>

        {/* Overlapping the image, so the first thing in reach is the thing
            that moves the visitor forward.

            relative z-10 is load-bearing: the hero's gradient is absolutely
            positioned, so without a stacking context of its own this box
            renders UNDERNEATH it and arrives half-swallowed by the image. */}
        <div className="relative z-10 mx-auto -mt-10 max-w-5xl px-4 sm:-mt-9">
          <SearchBox zones={zones} />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pt-8">
        <h2 className="sr-only">{t('filters.title')}</h2>
        <ul className="flex gap-2 overflow-x-auto pb-2">
          {QUICK_FILTERS.map(({ key, amenity }) => (
            <li key={key} className="shrink-0">
              <Link
                href={`/villas?amenities=${amenity}`}
                className="inline-flex items-center whitespace-nowrap rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 text-sm transition-colors hover:border-[var(--border-strong)]"
              >
                {t(`filters.${key}`)}
              </Link>
            </li>
          ))}
          {zones.slice(0, 6).map((zone) => (
            <li key={zone} className="shrink-0">
              <Link
                href={`/villas?zone=${encodeURIComponent(zone)}`}
                className="inline-flex items-center whitespace-nowrap rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 text-sm transition-colors hover:border-[var(--border-strong)]"
              >
                {zone}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10">
        <div className="mb-4 flex items-baseline gap-3">
          <h2 className="text-lg font-semibold sm:text-xl">{t('sections.featured')}</h2>
          <Link
            href="/villas"
            className="ml-auto flex items-center gap-1 text-sm text-[var(--accent)] hover:underline"
          >
            {common('action.seeAll')}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        {/* The cards depend on the referral cookie, so they stream separately
            and the shell above is cacheable. */}
        <Suspense fallback={<CardGridSkeleton />}>
          <FeaturedVillas />
        </Suspense>
      </section>
    </main>
  );
}

async function FeaturedVillas() {
  const villas = await getFeaturedVillas(8);

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {villas.map((villa, index) => (
        <VillaCard key={villa.code} villa={villa} priority={index < 4} />
      ))}
    </div>
  );
}

function CardGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="aspect-[4/3] w-full rounded-[var(--radius-lg)]" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      ))}
    </div>
  );
}
