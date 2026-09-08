import { PartyPopper } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { LocaleSwitcher } from '@/components/common/locale-switcher';
import { ThemeToggle } from '@/components/common/theme-toggle';

/**
 * The public header.
 *
 * Deliberately thin. The visitor came to look at houses, and every pixel of
 * chrome above the fold is a pixel not showing one. Navigation is two links
 * and the two switchers; everything else lives in the footer.
 */
export async function SiteHeader() {
  const t = await getTranslations('common');

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border-default)] bg-[var(--bg-surface)]/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:h-16">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <PartyPopper className="h-5 w-5 text-[var(--accent)]" aria-hidden />
          {t('brand')}
        </Link>

        <nav className="ml-2 hidden gap-1 sm:flex">
          <Link
            href="/villas"
            className="rounded-[var(--radius-md)] px-3 py-2 text-sm text-[var(--fg-muted)] transition-colors hover:bg-[var(--bg-sunken)] hover:text-[var(--fg-default)]"
          >
            {t('nav.villas')}
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
