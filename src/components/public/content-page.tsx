import { getTranslations } from 'next-intl/server';
import { getSiteSettings } from '@/lib/rates/context';

/**
 * The static content pages: about, contact, FAQ, terms and privacy.
 *
 * One component for all five, because they are the same shape and the
 * difference is entirely in the words. Splitting them into five near-identical
 * files is how one of them ends up with a heading style the others do not have.
 *
 * The cancellation policy is read from settings rather than hard-coded, so the
 * text a guest reads here and the text they agree to at checkout are literally
 * the same string.
 */

type Section = 'about' | 'contact' | 'faq' | 'terms' | 'privacy';

export async function ContentPage({ section }: { section: Section }) {
  const t = await getTranslations('content');
  const settings = await getSiteSettings();

  const paragraphs = t.raw(`${section}.body`) as string[];
  const faq = section === 'faq' ? (t.raw('faq.items') as { q: string; a: string }[]) : null;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold">{t(`${section}.title`)}</h1>

      <div className="mt-4 space-y-4 text-[var(--fg-muted)]">
        {paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>

      {faq ? (
        <dl className="mt-8 divide-y divide-[var(--border-default)]">
          {faq.map((item) => (
            <div key={item.q} className="py-4">
              <dt className="font-medium">{item.q}</dt>
              <dd className="mt-1 text-[var(--fg-muted)]">{item.a}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {/* The policy the guest actually agrees to, from the same record the
          booking form reads. Retyping it here would let the two drift. */}
      {section === 'terms' && settings?.cancellationPolicy?.th ? (
        <div className="mt-8 rounded-[var(--radius-lg)] border border-[var(--border-default)] p-5">
          <h2 className="font-medium">{t('cancellationPolicy')}</h2>
          <p className="mt-2 whitespace-pre-line text-[var(--fg-muted)]">
            {settings.cancellationPolicy.th}
          </p>
        </div>
      ) : null}

      {section === 'contact' ? (
        <dl className="mt-6 space-y-2">
          {settings?.contact?.phone ? (
            <div className="flex gap-2">
              <dt className="text-[var(--fg-muted)]">{t('phone')}</dt>
              <dd className="tnum">
                <a href={`tel:${settings.contact.phone.replace(/[^\d+]/g, '')}`}>
                  {settings.contact.phone}
                </a>
              </dd>
            </div>
          ) : null}
          {settings?.contact?.lineId ? (
            <div className="flex gap-2">
              <dt className="text-[var(--fg-muted)]">LINE</dt>
              <dd>{settings.contact.lineId}</dd>
            </div>
          ) : null}
          {settings?.contact?.email ? (
            <div className="flex gap-2">
              <dt className="text-[var(--fg-muted)]">{t('email')}</dt>
              <dd>
                <a href={`mailto:${settings.contact.email}`}>{settings.contact.email}</a>
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </main>
  );
}
