'use client';

import { CalendarDays, MapPin, Search, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The search box.
 *
 * One row on a desktop, a stack on a phone. It submits by navigating to the
 * search page with a query string rather than holding state anywhere: the URL
 * is the state, so a result page is shareable and the back button behaves.
 *
 * Check-out is constrained to be after check-in in the browser, and the search
 * page re-validates. A guest who picks the wrong order gets a corrected date
 * rather than an error.
 */
export function SearchBox({
  zones,
  defaults,
  className,
}: {
  zones: string[];
  defaults?: { zone?: string; checkIn?: string; checkOut?: string; guests?: number };
  className?: string;
}) {
  const t = useTranslations('common.label');
  const action = useTranslations('common.action');
  const router = useRouter();

  const [checkIn, setCheckIn] = useState(defaults?.checkIn ?? '');
  const [checkOut, setCheckOut] = useState(defaults?.checkOut ?? '');

  const today = new Date().toISOString().slice(0, 10);
  const minCheckOut = checkIn ? nextDay(checkIn) : today;

  function submit(formData: FormData) {
    const query = new URLSearchParams();
    for (const key of ['zone', 'checkIn', 'checkOut', 'guests'] as const) {
      const value = formData.get(key)?.toString().trim();
      if (value) query.set(key, value);
    }
    router.push(`/villas?${query.toString()}`);
  }

  return (
    <form
      action={submit}
      className={cn(
        'grid gap-2 rounded-[var(--radius-xl)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-2 shadow-[var(--shadow-float)]',
        'sm:grid-cols-[1.2fr_1fr_1fr_0.8fr_auto] sm:items-center',
        className,
      )}
    >
      <label className="relative">
        <span className="sr-only">{t('zone')}</span>
        <MapPin
          className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-[var(--fg-subtle)]"
          aria-hidden
        />
        <select
          name="zone"
          defaultValue={defaults?.zone ?? ''}
          className="h-11 w-full appearance-none rounded-[var(--radius-lg)] border-0 bg-transparent pl-9 pr-3 text-sm"
        >
          <option value="">{t('zone')}</option>
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
      </label>

      <label className="relative">
        <span className="sr-only">{t('checkIn')}</span>
        <CalendarDays
          className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-[var(--fg-subtle)]"
          aria-hidden
        />
        <input
          type="date"
          name="checkIn"
          min={today}
          value={checkIn}
          onChange={(event) => {
            setCheckIn(event.target.value);
            // Keeping an earlier check-out would submit a negative stay.
            if (checkOut && checkOut <= event.target.value) {
              setCheckOut(nextDay(event.target.value));
            }
          }}
          className="tnum h-11 w-full rounded-[var(--radius-lg)] border-0 bg-transparent pl-9 pr-2 text-sm"
        />
      </label>

      <label className="relative">
        <span className="sr-only">{t('checkOut')}</span>
        <CalendarDays
          className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-[var(--fg-subtle)]"
          aria-hidden
        />
        <input
          type="date"
          name="checkOut"
          min={minCheckOut}
          value={checkOut}
          onChange={(event) => setCheckOut(event.target.value)}
          className="tnum h-11 w-full rounded-[var(--radius-lg)] border-0 bg-transparent pl-9 pr-2 text-sm"
        />
      </label>

      <label className="relative">
        <span className="sr-only">{t('guests')}</span>
        <Users
          className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-[var(--fg-subtle)]"
          aria-hidden
        />
        <input
          type="number"
          name="guests"
          min={1}
          max={60}
          defaultValue={defaults?.guests ?? ''}
          placeholder={t('guests')}
          className="tnum h-11 w-full rounded-[var(--radius-lg)] border-0 bg-transparent pl-9 pr-2 text-sm"
        />
      </label>

      <Button type="submit" size="lg" className="sm:w-auto">
        <Search className="h-4 w-4" aria-hidden />
        {action('search')}
      </Button>
    </form>
  );
}

function nextDay(dateKey: string): string {
  return new Date(Date.parse(`${dateKey}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10);
}
