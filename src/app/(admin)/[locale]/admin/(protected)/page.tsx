import { CalendarArrowDown, CalendarArrowUp, Receipt, TrendingUp } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { requireActor } from '@/lib/auth/rbac';
import {
  getAgentBreakdown,
  getDailyRevenue,
  getKpis,
  getSlipsAwaitingReview,
  getTopVillas,
  getUpcoming,
} from '@/lib/reports/queries';
import { addDays, asDateKey, todayBangkok } from '@/lib/pricing';
import { RevenueChart } from '@/components/admin/revenue-chart';
import { Card, EmptyState, Money } from '@/components/ui/surface';

export { generateStaticParams } from '@/i18n/static-params';

/**
 * The dashboard.
 *
 * The range is the last thirty days plus the next sixty, because a villa
 * business is forward-looking: what matters most on a Monday morning is what
 * is booked for the months ahead, not what happened last quarter.
 *
 * Every figure is scoped to the actor. An agent opening this sees their own
 * bookings and nothing else.
 */
export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const actor = await requireActor();
  const t = await getTranslations('admin.dashboard');
  const agentT = await getTranslations('admin.agents');

  const raw = await searchParams;
  const today = todayBangkok();
  const range = {
    from: raw.from && /^\d{4}-\d{2}-\d{2}$/.test(raw.from) ? asDateKey(raw.from) : addDays(today, -30),
    to: raw.to && /^\d{4}-\d{2}-\d{2}$/.test(raw.to) ? asDateKey(raw.to) : addDays(today, 60),
  };

  const [kpis, daily, topVillas, agents, upcoming, slips] = await Promise.all([
    getKpis(range, actor),
    getDailyRevenue(range, actor),
    getTopVillas(range, actor, 8),
    actor.role === 'agent' ? Promise.resolve([]) : getAgentBreakdown(range),
    getUpcoming(actor, 7),
    getSlipsAwaitingReview(actor, 10),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <span className="tnum text-sm text-[var(--fg-muted)]">
          {range.from} — {range.to}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={t('revenue')} money={kpis.revenue} accent />
        <Kpi label={t('bookings')} value={String(kpis.bookings)} />
        <Kpi label={t('adr')} money={kpis.adr} hint={t('adrHint')} />
        <Kpi label={t('occupancy')} value={`${Math.round(kpis.occupancy * 100)}%`} />
      </div>

      {kpis.awaitingPaymentCount > 0 ? (
        <Card className="flex flex-wrap items-center gap-3 p-4">
          <Receipt className="h-5 w-5 text-[var(--color-warning)]" aria-hidden />
          <span className="text-sm">
            {t('awaitingPayment', { n: kpis.awaitingPaymentCount })}{' '}
            <Money satang={kpis.awaitingPayment} className="font-medium" />
          </span>
          <Link
            href="/admin/bookings?status=awaiting_payment"
            className="ml-auto text-sm text-[var(--accent)] hover:underline"
          >
            {t('review')}
          </Link>
        </Card>
      ) : null}

      <Card className="p-5">
        <h2 className="mb-3 flex items-center gap-2 font-medium">
          <TrendingUp className="h-4 w-4 text-[var(--fg-subtle)]" aria-hidden />
          {t('revenueByNight')}
        </h2>
        <RevenueChart points={daily} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 font-medium">{t('topVillas')}</h2>
          {topVillas.length === 0 ? (
            <EmptyState title={t('noData')} />
          ) : (
            <ol className="divide-y divide-[var(--border-default)] text-sm">
              {topVillas.map((villa) => (
                <li key={villa.code} className="flex items-center gap-3 py-2">
                  <span className="tnum text-[var(--fg-muted)]">{villa.code}</span>
                  <span className="min-w-0 flex-1 truncate">{villa.name}</span>
                  <span className="tnum text-[var(--fg-muted)]">{villa.nights} คืน</span>
                  <Money satang={villa.revenue} className="font-medium" />
                </li>
              ))}
            </ol>
          )}
        </Card>

        {actor.role === 'agent' ? null : (
          <Card className="p-5">
            <h2 className="mb-3 font-medium">{t('byAgent')}</h2>
            {agents.length === 0 ? (
              <EmptyState title={t('noData')} />
            ) : (
              <ul className="divide-y divide-[var(--border-default)] text-sm">
                {agents.map((agent) => (
                  <li key={agent.agentCode} className="flex items-center gap-3 py-2">
                    <span className="tnum min-w-0 flex-1 truncate">
                      {agent.agentCode === 'direct' ? t('direct') : `${agentT('agentCode')} ${agent.agentCode}`}
                    </span>
                    <span className="tnum text-[var(--fg-muted)]">{agent.bookings}</span>
                    <Money satang={agent.revenue} className="font-medium" />
                    <span className="tnum w-20 text-right text-[var(--accent)]">
                      +<Money satang={agent.markup} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 font-medium">
            <CalendarArrowDown className="h-4 w-4 text-[var(--fg-subtle)]" aria-hidden />
            {t('arrivals')}
          </h2>
          {upcoming.arrivals.length === 0 ? (
            <EmptyState title={t('noArrivals')} />
          ) : (
            <ul className="divide-y divide-[var(--border-default)] text-sm">
              {upcoming.arrivals.map((row) => (
                <li key={row.bookingNo} className="flex items-center gap-3 py-2">
                  <span className="tnum text-[var(--fg-muted)]">{row.checkIn}</span>
                  <span className="tnum">{row.villaCodeSnapshot}</span>
                  <span className="min-w-0 flex-1 truncate">{row.customer?.name}</span>
                  <span className="tnum text-[var(--fg-muted)]">{row.guests?.totalGuests}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 font-medium">
            <CalendarArrowUp className="h-4 w-4 text-[var(--fg-subtle)]" aria-hidden />
            {t('departures')}
          </h2>
          {upcoming.departures.length === 0 ? (
            <EmptyState title={t('noDepartures')} />
          ) : (
            <ul className="divide-y divide-[var(--border-default)] text-sm">
              {upcoming.departures.map((row) => (
                <li key={row.bookingNo} className="flex items-center gap-3 py-2">
                  <span className="tnum text-[var(--fg-muted)]">{row.checkOut}</span>
                  <span className="tnum">{row.villaCodeSnapshot}</span>
                  <span className="min-w-0 flex-1 truncate">{row.customer?.name}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {slips.length > 0 ? (
        <Card className="p-5">
          <h2 className="mb-3 font-medium">{t('slipsToReview')}</h2>
          <ul className="divide-y divide-[var(--border-default)] text-sm">
            {slips.map((row) => (
              <li key={row.bookingNo} className="flex items-center gap-3 py-2">
                <span className="tnum text-[var(--fg-muted)]">{row.bookingNo}</span>
                <span className="min-w-0 flex-1 truncate">{row.customer?.name}</span>
                <Money satang={row.priceBreakdown?.depositRequired ?? 0} className="font-medium" />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function Kpi({
  label,
  value,
  money,
  hint,
  accent,
}: {
  label: string;
  value?: string;
  money?: number;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <Card className="p-5">
      <p className="text-sm text-[var(--fg-muted)]">{label}</p>
      <p className={`mt-1 text-2xl font-semibold${accent ? ' text-[var(--accent)]' : ''}`}>
        {money === undefined ? <span className="tnum">{value}</span> : <Money satang={money} />}
      </p>
      {hint ? <p className="mt-1 text-xs text-[var(--fg-subtle)]">{hint}</p> : null}
    </Card>
  );
}
