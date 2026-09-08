'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

const OPTIONS = [
  { value: 'light', Icon: Sun },
  { value: 'dark', Icon: Moon },
  { value: 'system', Icon: Monitor },
] as const;

/**
 * Light, dark, or follow the system.
 *
 * There is no mounted guard here on purpose. next-themes reads the stored
 * choice in its own effect, so `theme` is undefined during SSR and on the
 * first client render alike: both produce the same markup and hydration
 * matches. The selected state then fills in without the header resizing,
 * which a placeholder-until-mounted version cannot avoid.
 */
export function ThemeToggle() {
  const t = useTranslations('common.theme');
  const { theme, setTheme } = useTheme();

  return (
    <div
      className="inline-flex rounded-[var(--radius-md)] border border-[var(--border-default)] p-0.5"
      role="radiogroup"
      aria-label={t('toggle')}
    >
      {OPTIONS.map(({ value, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          aria-label={t(value)}
          title={t(value)}
          onClick={() => setTheme(value)}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] transition-colors',
            theme === value
              ? 'bg-[var(--bg-sunken)] text-[var(--fg-default)]'
              : 'text-[var(--fg-subtle)] hover:text-[var(--fg-default)]',
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </button>
      ))}
    </div>
  );
}
