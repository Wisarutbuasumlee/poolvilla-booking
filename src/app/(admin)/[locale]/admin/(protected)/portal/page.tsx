import { CalendarCheck, Wallet } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { forbidden } from 'next/navigation';

import type { Locale } from '@/i18n/routing';
import { requireRole } from '@/lib/auth/rbac';
import { getAgentDetail, listBookingsForActor } from '@/lib/agents/queries';
import { MarkupEditor } from '@/components/admin/markup-editor';
import { ReferralLink } from '@/components/admin/referral-link';
import { publicOrigin } from '@/lib/site-origin';
import { Badge, Card, EmptyState, Money } from '@/components/ui/surface';

export { generateStaticParams } from '@/i18n/static-params';

/**
 * The agent's own portal.
 *
 * An agent sees only their villas, their prices and their bookings. The
 * scoping is a query against the villa-agent links, not a filter applied to a
 * list that was fetched unscoped: a page that loads everything and then hides
 * most of it has already sent it to the browser.
 *
 * Agents can change their markup here. They cannot touch the base rate, which
 * is the company's, and they cannot see another agent's numbers.
 */
export default async function AgentPortalPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const actor = await requireRole('agent', 'superadmin', 'staff');

  // Staff have their own screens; this one is the agent's view of themselves,
  // and without an agent identity there is nothing to show.
  if (!actor.agentId) forbidden();

  const t = await getTranslations('admin.portal');
  const agentT = await getTranslations('admin.agents');
  const booking = await getTranslations('booking');

  const [detail, bookings, origin] = await Promise.all([
    getAgentDetail(actor.agentId),
    listBookingsForActor(actor, 30),
    publicOrigin(),
  ]);

  if (!detail) forbidden();

  const active = detail.links.filter((link) => link.isActive);

  const earned = bookings
    .filter((row) => ['confirmed', 'checked_in', 'completed'].includes(row.status))
    .reduce((total, row) => total + (row.priceBreakdown?.markupTotal ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="tnum text-sm text-[var(--fg-muted)]">
          {agentT('agentCode')} {detail.agent.agentCode}
        </p>
        <h1 className="text-xl font-semibold">{detail.agent.name}</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="flex items-center gap-2 text-sm text-[var(--fg-muted)]">
            <CalendarCheck className="h-4 w-4" aria-hidden />
            {agentT('bookings')}
          </p>
          <p className="tnum mt-1 text-2xl font-semibold">{bookings.length}</p>
        </Card>

        <Card className="p-5">
          <p className="flex items-center gap-2 text-sm text-[var(--fg-muted)]">
            <Wallet className="h-4 w-4" aria-hidden />
            {agentT('markupEarned')}
          </p>
          <Money satang={earned} className="mt-1 block text-2xl font-semibold text-[var(--accent)]" />
        </Card>

        <Card className="p-5">
          <p className="text-sm text-[var(--fg-muted)]">{agentT('villas')}</p>
          <p className="tnum mt-1 text-2xl font-semibold">{active.length}</p>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="mb-3 font-medium">{agentT('referralLink')}</h2>
        <ReferralLink agentCode={detail.agent.agentCode} origin={origin} />
        <p className="mt-2 text-sm text-[var(--fg-muted)]">{agentT('referralHint')}</p>
      </Card>

      <div>
        <h2 className="mb-3 font-medium">{t('yourPrices')}</h2>
        {active.length === 0 ? (
          <Card>
            <EmptyState title={agentT('noVillas.title')} body={t('askOffice')} />
          </Card>
        ) : (
          <ul className="space-y-4">
            {active.map((link) => (
              <li key={link.id}>
                <Card className="p-5">
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <span className="tnum text-sm text-[var(--fg-muted)]">{link.code}</span>
                    <span className="font-medium">{link.name}</span>
                    <span className="text-sm text-[var(--fg-muted)]">{link.zone}</span>
                  </div>

                  {link.base ? (
                    <MarkupEditor
                      villaId={link.villaId}
                      agentId={actor.agentId!}
                      base={link.base}
                      markup={link.markup}
                    />
                  ) : (
                    <p className="text-sm text-[var(--fg-muted)]">{agentT('villaMissingRates')}</p>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="mb-3 font-medium">{t('yourBookings')}</h2>
        {bookings.length === 0 ? (
          <Card>
            <EmptyState title={t('noBookings.title')} body={t('noBookings.body')} />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-[var(--border-default)]">
              {bookings.map((row) => (
                <li key={row.bookingNo} className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tnum text-sm text-[var(--fg-muted)]">{row.bookingNo}</span>
                      <Badge tone={statusTone(row.status)}>{booking(`status.${row.status}`)}</Badge>
                    </div>
                    <p className="tnum truncate text-sm">
                      {row.villaCodeSnapshot} · {row.checkIn} ถึง {row.checkOut} ({row.nights})
                    </p>
                    <p className="truncate text-sm text-[var(--fg-muted)]">
                      {row.customer?.name} {row.customer?.phone}
                    </p>
                  </div>

                  <div className="text-right">
                    <Money satang={row.priceBreakdown?.grandTotal ?? 0} className="font-medium" />
                    <p className="text-xs text-[var(--accent)]">
                      +<Money satang={row.priceBreakdown?.markupTotal ?? 0} />
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

function statusTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (['confirmed', 'checked_in', 'completed'].includes(status)) return 'success';
  if (['awaiting_payment', 'pending'].includes(status)) return 'warning';
  if (['cancelled', 'expired', 'no_show'].includes(status)) return 'danger';
  return 'neutral';
}
