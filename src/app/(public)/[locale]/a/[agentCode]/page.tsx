import { MessageCircle, Phone } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import type { Locale } from '@/i18n/routing';
import { getAgentByCode } from '@/lib/agents/queries';
import { connectToDatabase } from '@/lib/db/connect';
import { VillaModel } from '@/lib/db/models/villa';
import { getPricingContext } from '@/lib/rates/context';
import { fromPrice, getRateCards, type VillaRateSource } from '@/lib/rates/rate-cards';
import { VillaCard, type VillaCardData } from '@/components/public/villa-card';
import { Card } from '@/components/ui/surface';

export { generateStaticParams } from '@/i18n/static-params';

/**
 * An agent's own shop window: /a/123.
 *
 * Opening this page is what sets the referral. Everything the visitor looks at
 * afterwards, on any page, shows this agent's prices and this agent's contact
 * details, because src/proxy.ts wrote their code to a cookie on the way in.
 *
 * Never indexed. Three agents selling the same house would otherwise put three
 * near-identical pages in front of a search engine, and the canonical villa
 * page is the one that should rank.
 */
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default async function AgentPage({
  params,
}: {
  params: Promise<{ locale: Locale; agentCode: string }>;
}) {
  const { locale, agentCode } = await params;
  setRequestLocale(locale);

  const found = await getAgentByCode(agentCode);
  if (!found) notFound();

  const { agent, villaIds } = found;
  const t = await getTranslations('agent');
  const action = await getTranslations('common.action');

  await connectToDatabase();
  const villas = await VillaModel.find({ _id: { $in: villaIds }, status: 'published' })
    .sort({ 'stats.bookingCount': -1 })
    .lean();

  // The cookie was set by the proxy on this very request, so these are already
  // this agent's prices rather than the base ones.
  const context = await getPricingContext();
  const cards = await getRateCards(villas as unknown as VillaRateSource[], context);

  const lineHref = agent.lineId
    ? agent.lineId.startsWith('@')
      ? `https://line.me/R/ti/p/${encodeURIComponent(agent.lineId)}`
      : `https://line.me/ti/p/~${encodeURIComponent(agent.lineId)}`
    : null;

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <Card className="mb-6 p-5">
        <p className="tnum text-sm text-[var(--fg-muted)]">
          {t('agentCode')} {agent.agentCode}
        </p>
        <h1 className="text-xl font-semibold sm:text-2xl">{agent.name}</h1>
        <p className="mt-1 text-sm text-[var(--fg-muted)]">{t('tagline')}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          {agent.phone ? (
            <a
              href={`tel:${agent.phone.replace(/[^\d+]/g, '')}`}
              className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-default)] px-4 text-sm hover:border-[var(--border-strong)]"
            >
              <Phone className="h-4 w-4" aria-hidden />
              {agent.phone}
            </a>
          ) : null}

          {lineHref ? (
            <a
              href={lineHref}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-line)] px-4 text-sm font-medium text-[var(--color-line-ink)] hover:opacity-90"
            >
              <MessageCircle className="h-4 w-4" aria-hidden />
              {action('lineChat')}
            </a>
          ) : null}
        </div>
      </Card>

      <h2 className="mb-3 text-lg font-semibold">{t('villas', { n: villas.length })}</h2>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {villas.map((villa, index) => {
          const card = cards.get(villa._id.toString());
          if (!card) return null;

          const cover = villa.images?.find((image) => image.isCover) ?? villa.images?.[0];

          const data: VillaCardData = {
            code: villa.code,
            name: villa.name?.th ?? villa.code,
            zone: villa.location?.zone ?? '',
            bedrooms: villa.capacity?.bedrooms ?? 0,
            bathrooms: villa.capacity?.bathrooms ?? 0,
            baseGuests: villa.capacity?.baseGuests ?? 0,
            hasSlider: Boolean(villa.pool?.hasSlider),
            distanceToBeachKm: villa.location?.distanceToBeachKm ?? null,
            coverUrl: cover?.thumbUrl ?? cover?.url ?? null,
            coverIsSynthetic: Boolean(cover?.isSynthetic),
            price: fromPrice(card),
            priceIsTotal: false,
            nights: 0,
          };

          return <VillaCard key={villa.code} villa={data} priority={index < 4} />;
        })}
      </div>
    </main>
  );
}
