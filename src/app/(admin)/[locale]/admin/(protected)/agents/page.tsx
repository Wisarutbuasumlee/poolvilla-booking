import { UsersRound } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { requireRole } from '@/lib/auth/rbac';
import { listAgents } from '@/lib/agents/queries';
import { ReferralLink } from '@/components/admin/referral-link';
import { publicOrigin } from '@/lib/site-origin';
import { Badge, Card, EmptyState, Money } from '@/components/ui/surface';

export { generateStaticParams } from '@/i18n/static-params';

/**
 * The agent roster.
 *
 * Three money columns, and they mean different things. Revenue is what the
 * guest paid. Commission is what the company owes on its own share. Markup is
 * what the agent kept by pricing above the base rate, which is their real
 * income. Showing only one of them would misstate what anybody is owed.
 *
 * All three come from the booking snapshots, so they describe what actually
 * happened rather than what today's rates would produce.
 */
export default async function AdminAgentsPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  await requireRole('superadmin', 'staff');
  const t = await getTranslations('admin.agents');
  const origin = await publicOrigin();
  const agents = await listAgents();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <span className="text-sm text-[var(--fg-muted)]">{t('count', { n: agents.length })}</span>
      </div>

      {agents.length === 0 ? (
        <Card>
          <EmptyState
            icon={<UsersRound className="h-8 w-8" aria-hidden />}
            title={t('empty.title')}
            body={t('empty.body')}
          />
        </Card>
      ) : (
        <ul className="space-y-4">
          {agents.map((agent) => (
            <li key={agent.id}>
              <Card className="p-5">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tnum text-sm text-[var(--fg-muted)]">
                        {t('agentCode')} {agent.agentCode}
                      </span>
                      <Badge tone={agent.status === 'active' ? 'success' : 'warning'}>
                        {t(`status.${agent.status}`)}
                      </Badge>
                    </div>

                    <Link
                      href={`/admin/agents/${agent.id}`}
                      className="mt-0.5 block font-medium hover:underline"
                    >
                      {agent.name}
                    </Link>

                    <p className="tnum text-sm text-[var(--fg-muted)]">
                      {agent.phone}
                      {agent.lineId ? ` · LINE ${agent.lineId}` : ''}
                    </p>
                  </div>

                  <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                    <Stat term={t('villas')} value={String(agent.villaCount)} />
                    <Stat term={t('bookings')} value={String(agent.bookingCount)} />
                    <Stat term={t('revenue')} money={agent.revenue} />
                    <Stat term={t('markupEarned')} money={agent.markupEarned} accent />
                  </dl>
                </div>

                <div className="mt-4 border-t border-[var(--border-default)] pt-4">
                  <ReferralLink agentCode={agent.agentCode} origin={origin} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({
  term,
  value,
  money,
  accent,
}: {
  term: string;
  value?: string;
  money?: number;
  accent?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-[var(--fg-muted)]">{term}</dt>
      <dd className={accent ? 'font-semibold text-[var(--accent)]' : 'font-medium'}>
        {money === undefined ? <span className="tnum">{value}</span> : <Money satang={money} />}
      </dd>
    </div>
  );
}
