import { ArrowLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { requireRole } from '@/lib/auth/rbac';
import { getAgentDetail } from '@/lib/agents/queries';
import { MarkupEditor } from '@/components/admin/markup-editor';
import { ReferralLink } from '@/components/admin/referral-link';
import { publicOrigin } from '@/lib/site-origin';
import { Badge, Card, EmptyState } from '@/components/ui/surface';

export { generateStaticParams } from '@/i18n/static-params';

/**
 * One agent, and what they charge for each villa they hold.
 *
 * This is the screen that makes the two-layer pricing visible: the company's
 * base rate, the agent's markup, and the selling price, side by side for every
 * house. Anyone looking at it can see immediately why the same villa costs
 * different amounts through different agents.
 */
export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ locale: Locale; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  await requireRole('superadmin', 'staff');
  const t = await getTranslations('admin.agents');
  const origin = await publicOrigin();

  const detail = await getAgentDetail(id);
  if (!detail) notFound();

  const { agent, links } = detail;
  const active = links.filter((link) => link.isActive);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/agents"
          className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] text-[var(--fg-muted)] hover:bg-[var(--bg-sunken)]"
          aria-label={t('backToList')}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </Link>
        <div>
          <p className="tnum text-sm text-[var(--fg-muted)]">
            {t('agentCode')} {agent.agentCode}
          </p>
          <h1 className="text-xl font-semibold">{agent.name}</h1>
        </div>
        <Badge tone={agent.status === 'active' ? 'success' : 'warning'} className="ml-auto">
          {t(`status.${agent.status}`)}
        </Badge>
      </div>

      <Card className="p-5">
        <h2 className="mb-3 font-medium">{t('referralLink')}</h2>
        <ReferralLink agentCode={agent.agentCode} origin={origin} />
        <p className="mt-2 text-sm text-[var(--fg-muted)]">{t('referralHint')}</p>
      </Card>

      <div>
        <h2 className="mb-3 font-medium">{t('villasAndPrices', { n: active.length })}</h2>

        {active.length === 0 ? (
          <Card>
            <EmptyState title={t('noVillas.title')} body={t('noVillas.body')} />
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
                    {link.canBlockDates ? (
                      <Badge tone="accent" className="ml-auto">
                        {t('canBlockDates')}
                      </Badge>
                    ) : null}
                  </div>

                  {link.base ? (
                    <MarkupEditor
                      villaId={link.villaId}
                      agentId={id}
                      base={link.base}
                      markup={link.markup}
                    />
                  ) : (
                    <p className="text-sm text-[var(--fg-muted)]">{t('villaMissingRates')}</p>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
