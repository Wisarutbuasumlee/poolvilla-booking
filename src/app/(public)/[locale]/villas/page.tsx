import { SearchX } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';

import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import {
  getPublicZones,
  parseSearchFilters,
  searchVillas,
  type SearchFilters,
} from '@/lib/villas/public-queries';
import { SearchBox } from '@/components/public/search-box';
import { VillaCard } from '@/components/public/villa-card';
import { EmptyState, Skeleton } from '@/components/ui/surface';
import { buttonStyles } from '@/components/ui/button';
import { AMENITIES } from '@/lib/villas/constants';
import { cn } from '@/lib/utils';

export { generateStaticParams } from '@/i18n/static-params';

/**
 * Search results.
 *
 * The URL is the entire state. Every filter is a link, so results are
 * shareable, the back button works, and a guest can paste the page into a
 * group chat and everyone sees the same houses at the same prices.
 */
export default async function VillasPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const raw = await searchParams;
  const filters = parseSearchFilters(raw);
  const [t, zones] = await Promise.all([getTranslations('search'), getPublicZones()]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <SearchBox
        zones={zones}
        defaults={{
          zone: filters.zone,
          checkIn: filters.checkIn,
          checkOut: filters.checkOut,
          guests: filters.guests,
        }}
      />

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <FilterChips filters={filters} label={t('amenity')} />

        <label className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-[var(--fg-muted)]">{t('sortBy')}</span>
          <SortLinks filters={filters} />
        </label>
      </div>

      <Suspense key={JSON.stringify(filters)} fallback={<ResultsSkeleton />}>
        <Results filters={filters} />
      </Suspense>
    </main>
  );
}

async function Results({ filters }: { filters: SearchFilters }) {
  const t = await getTranslations('search');
  const { cards, total, pages, hasDates } = await searchVillas(filters);

  if (cards.length === 0) {
    return (
      <div className="mt-6 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)]">
        <EmptyState
          icon={<SearchX className="h-8 w-8" aria-hidden />}
          title={t('empty.title')}
          body={hasDates ? t('empty.withDates') : t('empty.body')}
          action={
            <Link href="/villas" className={buttonStyles({ size: 'sm', variant: 'secondary' })}>
              {t('empty.clear')}
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <>
      <p className="mt-5 text-sm text-[var(--fg-muted)]">
        {hasDates ? t('foundForDates', { total }) : t('found', { total })}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {cards.map((villa, index) => (
          <VillaCard key={villa.code} villa={villa} priority={index < 4} />
        ))}
      </div>

      {pages > 1 ? (
        <nav className="mt-8 flex justify-center gap-2" aria-label="pagination">
          {Array.from({ length: pages }, (_, i) => i + 1).map((page) => (
            <Link
              key={page}
              href={{ pathname: '/villas', query: toQuery({ ...filters, page }) }}
              aria-current={page === filters.page ? 'page' : undefined}
              className={cn(
                'tnum flex h-10 min-w-10 items-center justify-center rounded-[var(--radius-md)] px-3 text-sm',
                page === filters.page
                  ? 'bg-[var(--accent)] text-[var(--fg-onBrand)]'
                  : 'border border-[var(--border-default)] hover:border-[var(--border-strong)]',
              )}
            >
              {page}
            </Link>
          ))}
        </nav>
      ) : null}
    </>
  );
}

/** Amenity filters as links, so each combination has a real URL. */
function FilterChips({ filters, label }: { filters: SearchFilters; label: string }) {
  const active = new Set(filters.amenities ?? []);
  // Only the amenities guests actually filter on. The full list belongs on
  // the villa page, not across the top of a results grid.
  const shown = ['pool_slide', 'karaoke', 'snooker', 'kids_pool', 'bbq_grill'] as const;

  return (
    <ul className="flex flex-wrap gap-2" aria-label={label}>
      {shown.map((amenity) => {
        const on = active.has(amenity);
        const next = new Set(active);
        if (on) next.delete(amenity);
        else next.add(amenity);

        return (
          <li key={amenity}>
            <Link
              href={{
                pathname: '/villas',
                query: toQuery({ ...filters, amenities: [...next], page: 1 }),
              }}
              aria-pressed={on}
              className={cn(
                'inline-flex rounded-full border px-3 py-1.5 text-sm transition-colors',
                on
                  ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]'
                  : 'border-[var(--border-default)] text-[var(--fg-muted)] hover:border-[var(--border-strong)]',
              )}
            >
              {AMENITY_LABEL[amenity]}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function SortLinks({ filters }: { filters: SearchFilters }) {
  const options = ['popular', 'price_asc', 'price_desc', 'newest'] as const;
  return (
    <span className="flex gap-1">
      {options.map((sort) => (
        <Link
          key={sort}
          href={{ pathname: '/villas', query: toQuery({ ...filters, sort, page: 1 }) }}
          className={cn(
            'rounded-[var(--radius-sm)] px-2 py-1 transition-colors',
            filters.sort === sort
              ? 'bg-[var(--bg-sunken)] font-medium text-[var(--fg-default)]'
              : 'text-[var(--fg-muted)] hover:text-[var(--fg-default)]',
          )}
        >
          {SORT_LABEL[sort]}
        </Link>
      ))}
    </span>
  );
}

/** Drops empty values so the URL stays short and two identical searches match. */
function toQuery(filters: SearchFilters): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {};
  if (filters.zone) query.zone = filters.zone;
  if (filters.checkIn) query.checkIn = filters.checkIn;
  if (filters.checkOut) query.checkOut = filters.checkOut;
  if (filters.guests) query.guests = String(filters.guests);
  if (filters.bedrooms) query.bedrooms = String(filters.bedrooms);
  if (filters.amenities?.length) query.amenities = filters.amenities;
  if (filters.sort !== 'popular') query.sort = filters.sort;
  if (filters.page > 1) query.page = String(filters.page);
  return query;
}

function ResultsSkeleton() {
  return (
    <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
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

// Labels stay in Thai here rather than going through next-intl: they are the
// amenity vocabulary the whole product uses, and duplicating them across three
// message files would let them drift from the enum they belong to.
const AMENITY_LABEL: Record<(typeof AMENITIES)[number] | string, string> = {
  pool_slide: 'สไลเดอร์',
  karaoke: 'คาราโอเกะ',
  snooker: 'โต๊ะสนุ๊ก',
  kids_pool: 'สระเด็ก',
  bbq_grill: 'เตาปิ้งย่าง',
};

const SORT_LABEL = {
  popular: 'ยอดนิยม',
  price_asc: 'ราคาต่ำก่อน',
  price_desc: 'ราคาสูงก่อน',
  newest: 'มาใหม่',
} as const;
