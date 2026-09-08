import { MessageCircle, Phone } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { getPricingContext, getSiteSettings } from '@/lib/rates/context';
import { cn } from '@/lib/utils';

/**
 * The floating LINE and phone buttons.
 *
 * Most Thai guests decide on LINE, not on a form. This is the primary way the
 * business is actually contacted, so it stays reachable on every page and
 * never scrolls away on a phone.
 *
 * When a referral link brought the visitor here, these point at THAT agent.
 * Sending their customer to the head office would take the booking away from
 * the person whose link they followed.
 */
export async function ContactBar() {
  const [t, settings, context] = await Promise.all([
    getTranslations('common.action'),
    getSiteSettings(),
    getPricingContext(),
  ]);

  const lineId = context.agentLineId ?? settings?.contact?.lineId ?? null;
  const phone = context.agentPhone ?? settings?.contact?.phone ?? null;

  if (!lineId && !phone) return null;

  const lineHref = lineId
    ? lineId.startsWith('@')
      ? `https://line.me/R/ti/p/${encodeURIComponent(lineId)}`
      : `https://line.me/ti/p/~${encodeURIComponent(lineId)}`
    : null;

  return (
    <div
      className={cn(
        'fixed bottom-4 right-4 z-40 flex flex-col gap-2',
        // Sits above the sticky booking bar on a villa page.
        'sm:bottom-6 sm:right-6',
      )}
    >
      {phone ? (
        <a
          href={`tel:${phone.replace(/[^\d+]/g, '')}`}
          aria-label={t('call')}
          title={t('call')}
          className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--fg-default)] shadow-[var(--shadow-float)] transition-transform hover:scale-105"
        >
          <Phone className="h-5 w-5" aria-hidden />
        </a>
      ) : null}

      {lineHref ? (
        <a
          href={lineHref}
          target="_blank"
          rel="noreferrer noopener"
          className="flex h-12 items-center gap-2 rounded-full bg-[var(--color-line)] px-4 text-[var(--color-line-ink)] shadow-[var(--shadow-float)] transition-transform hover:scale-105"
        >
          <MessageCircle className="h-5 w-5" aria-hidden />
          <span className="hidden text-sm font-medium sm:inline">{t('lineChat')}</span>
        </a>
      ) : null}
    </div>
  );
}
