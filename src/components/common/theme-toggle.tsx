'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils';

const OPTIONS = [
  { value: 'light', Icon: Sun },
  { value: 'dark', Icon: Moon },
  { value: 'system', Icon: Monitor },
] as const;

const NO_SUBSCRIBE = () => () => {};

/**
 * True only after hydration has finished.
 *
 * React reads the server snapshot while hydrating and the client snapshot on
 * every render after, which is precisely the guarantee needed here. Setting a
 * flag in an effect would do the same thing but renders once with the wrong
 * value first, and React 19 flags that pattern.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(
    NO_SUBSCRIBE,
    () => true,
    () => false,
  );
}

/**
 * Light, dark, or follow the system.
 *
 * next-themes resolves the stored choice from a blocking script before React
 * hydrates, so reading it during the first render would disagree with the
 * server markup. Rather than suppressing that warning, nothing is marked
 * selected until hydration is done: the buttons are always in the same place
 * and at the same size, so the only thing that appears is the highlight.
 */
export function ThemeToggle() {
  const t = useTranslations('common.theme');
  const { theme, setTheme } = useTheme();
  const hydrated = useHydrated();

  return (
    <div
      className="inline-flex rounded-[var(--radius-md)] border border-[var(--border-default)] p-0.5"
      role="radiogroup"
      aria-label={t('toggle')}
    >
      {OPTIONS.map(({ value, Icon }) => {
        const active = hydrated && theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={t(value)}
            title={t(value)}
            onClick={() => setTheme(value)}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] transition-colors',
              active
                ? 'bg-[var(--bg-sunken)] text-[var(--fg-default)]'
                : 'text-[var(--fg-subtle)] hover:text-[var(--fg-default)]',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
