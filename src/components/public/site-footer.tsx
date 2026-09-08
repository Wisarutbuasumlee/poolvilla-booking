import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getSiteSettings } from '@/lib/rates/context';

/**
 * The footer.
 *
 * Carries the contact details and the policies a guest is agreeing to when
 * they book. The cancellation policy in particular has to be findable without
 * starting a booking: a guest who can only read it at the moment they pay has
 * not really been told.
 */
export async function SiteFooter() {
  const [t, common, settings] = await Promise.all([
    getTranslations('footer'),
    getTranslations('common'),
    getSiteSettings(),
  ]);

  return (
    <footer className="mt-12 border-t border-[var(--border-default)] bg-[var(--bg-surface)]">
      {/* Bottom padding clears the floating LINE and call buttons, so the last
          link is never sitting underneath one. */}
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 pb-28 sm:grid-cols-3 sm:pb-10">
        <div>
          <p className="font-semibold">{common('brand')}</p>
          <p className="mt-1 text-sm text-[var(--fg-muted)]">{common('tagline')}</p>
        </div>

        <nav aria-label={t('links')}>
          <h2 className="mb-2 text-sm font-medium">{t('links')}</h2>
          <ul className="space-y-1 text-sm text-[var(--fg-muted)]">
            {[
              { href: '/villas', label: common('nav.villas') },
              { href: '/booking/lookup', label: t('checkBooking') },
              { href: '/faq', label: common('nav.faq') },
              { href: '/about', label: common('nav.about') },
              { href: '/contact', label: common('nav.contact') },
              { href: '/terms', label: t('terms') },
              { href: '/privacy', label: t('privacy') },
            ].map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="hover:text-[var(--fg-default)] hover:underline">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h2 className="mb-2 text-sm font-medium">{common('nav.contact')}</h2>
          <ul className="space-y-1 text-sm text-[var(--fg-muted)]">
            {settings?.contact?.phone ? (
              <li>
                <a
                  href={`tel:${settings.contact.phone.replace(/[^\d+]/g, '')}`}
                  className="tnum hover:text-[var(--fg-default)]"
                >
                  {settings.contact.phone}
                </a>
              </li>
            ) : null}
            {settings?.contact?.lineId ? <li>LINE {settings.contact.lineId}</li> : null}
            {settings?.contact?.email ? (
              <li>
                <a
                  href={`mailto:${settings.contact.email}`}
                  className="hover:text-[var(--fg-default)]"
                >
                  {settings.contact.email}
                </a>
              </li>
            ) : null}
          </ul>
        </div>
      </div>

      <div className="border-t border-[var(--border-default)] px-4 py-4">
        <p className="mx-auto max-w-7xl text-xs text-[var(--fg-subtle)]">
          © {new Date().getFullYear()} {common('brand')}
        </p>
      </div>
    </footer>
  );
}
