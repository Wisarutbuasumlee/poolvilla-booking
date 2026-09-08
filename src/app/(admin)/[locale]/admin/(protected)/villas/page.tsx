import { Building2, Plus, Search } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import Image from 'next/image';

import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { requireActor } from '@/lib/auth/rbac';
import { listVillas, listZones } from '@/lib/villas/queries';
import { VillaListFiltersSchema } from '@/lib/validation/villa';
import { Button, buttonStyles } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { Badge, Card, EmptyState, Money } from '@/components/ui/surface';
import { cn } from '@/lib/utils';

export { generateStaticParams } from '@/i18n/static-params';

const STATUS_TONE = {
  published: 'success',
  draft: 'neutral',
  hidden: 'warning',
} as const;

export default async function AdminVillasPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const actor = await requireActor();
  const t = await getTranslations('admin');
  const common = await getTranslations('common');

  // The URL is the state. A shared link reproduces exactly what the sender saw.
  const filters = VillaListFiltersSchema.parse(await searchParams);
  const [{ rows, total, pages }, zones] = await Promise.all([
    listVillas(actor, filters),
    listZones(actor),
  ]);

  const canCreate = actor.role !== 'agent';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{t('nav.villas')}</h1>
        <span className="text-sm text-[var(--fg-muted)]">{t('villas.count', { total })}</span>
        {canCreate ? (
          <Link href="/admin/villas/new" className={cn(buttonStyles({ size: 'sm' }), 'ml-auto')}>
            <Plus className="h-4 w-4" aria-hidden />
            {t('villas.create')}
          </Link>
        ) : null}
      </div>

      {/* A plain GET form: the browser builds the query string, so back and
          forward work and the result is linkable without any client state. */}
      <form className="flex flex-wrap gap-2" role="search">
        <label className="relative min-w-56 flex-1">
          <span className="sr-only">{common('action.search')}</span>
          <Search
            className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-[var(--fg-subtle)]"
            aria-hidden
          />
          <Input
            name="q"
            defaultValue={filters.q ?? ''}
            placeholder={t('villas.searchPlaceholder')}
            className="pl-9"
          />
        </label>

        <Select name="status" defaultValue={filters.status ?? ''} className="w-40">
          <option value="">{t('villas.anyStatus')}</option>
          <option value="published">{t('villas.status.published')}</option>
          <option value="draft">{t('villas.status.draft')}</option>
          <option value="hidden">{t('villas.status.hidden')}</option>
        </Select>

        <Select name="zone" defaultValue={filters.zone ?? ''} className="w-40">
          <option value="">{t('villas.anyZone')}</option>
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </Select>

        <Button type="submit" variant="secondary">
          {common('action.search')}
        </Button>
      </form>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Building2 className="h-8 w-8" aria-hidden />}
            title={t('villas.empty.title')}
            body={t('villas.empty.body')}
            action={
              canCreate ? (
                <Link href="/admin/villas/new" className={buttonStyles({ size: 'sm' })}>
                  {t('villas.create')}
                </Link>
              ) : null
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {/* One row layout, not a table that collapses into cards below a
              breakpoint. Staff open this on a phone at the villa. */}
          <ul className="divide-y divide-[var(--border-default)]">
            {rows.map((villa) => (
              <li key={villa.id}>
                <Link
                  href={`/admin/villas/${villa.id}`}
                  className="flex items-center gap-4 p-3 transition-colors hover:bg-[var(--bg-sunken)] sm:p-4"
                >
                  <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-[var(--radius-md)] bg-[var(--bg-sunken)]">
                    {villa.coverUrl ? (
                      <Image
                        src={villa.coverUrl}
                        alt=""
                        fill
                        sizes="80px"
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[var(--fg-subtle)]">
                        <Building2 className="h-5 w-5" aria-hidden />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tnum text-sm font-medium text-[var(--fg-muted)]">
                        {villa.code}
                      </span>
                      <Badge tone={STATUS_TONE[villa.status]}>
                        {t(`villas.status.${villa.status}`)}
                      </Badge>
                    </div>
                    <p className="truncate font-medium">{villa.name}</p>
                    <p className="truncate text-sm text-[var(--fg-muted)]">
                      {villa.zone} · {t('villas.rooms', { n: villa.bedrooms })} ·{' '}
                      {t('villas.guests', { n: villa.baseGuests })} ·{' '}
                      {t('villas.agents', { n: villa.agentCount })}
                    </p>
                  </div>

                  <div className="hidden shrink-0 text-right sm:block">
                    <Money satang={villa.satRate} className="font-semibold" />
                    <p className="text-xs text-[var(--fg-muted)]">{t('villas.saturdayRate')}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {pages > 1 ? (
        <nav className="flex items-center justify-center gap-2" aria-label="pagination">
          {Array.from({ length: pages }, (_, i) => i + 1).map((page) => (
            <Link
              key={page}
              href={{ pathname: '/admin/villas', query: { ...filters, page } }}
              aria-current={page === filters.page ? 'page' : undefined}
              className={cn(
                'tnum flex h-9 min-w-9 items-center justify-center rounded-[var(--radius-md)] px-2 text-sm',
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
    </div>
  );
}
