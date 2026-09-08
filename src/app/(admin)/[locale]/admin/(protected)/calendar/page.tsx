import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { requireActor } from '@/lib/auth/rbac';
import { getCalendarGrid } from '@/lib/reports/queries';
import { addDays, asDateKey, todayBangkok, weekdayOf } from '@/lib/pricing';
import { Card, EmptyState } from '@/components/ui/surface';
import { cn } from '@/lib/utils';

export { generateStaticParams } from '@/i18n/static-params';

/**
 * Every villa, every night of one month, on one screen.
 *
 * Villas down, days across. This is the view staff leave open all day and
 * answer the phone from, so it is dense on purpose: a layout that needs
 * scrolling to compare two villas cannot answer "what have you got that
 * weekend" while somebody waits.
 *
 * The whole board is one query. Asking per villa would be thirty round trips
 * for a thirty-villa month.
 */
export default async function AdminCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  await requireActor();
  const t = await getTranslations('admin.calendar');

  const raw = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(raw.month ?? '') ? raw.month! : todayBangkok().slice(0, 7);

  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const first = asDateKey(`${month}-01`);
  const dayCount = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const last = addDays(first, dayCount - 1);

  const days = Array.from({ length: dayCount }, (_, i) => addDays(first, i));
  const rows = await getCalendarGrid(first, last);
  const today = todayBangkok();

  const previous = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{t('title')}</h1>

        <nav className="ml-auto flex items-center gap-1 text-sm">
          <Link
            href={{ pathname: '/admin/calendar', query: { month: previous } }}
            className="rounded-[var(--radius-md)] px-3 py-1.5 hover:bg-[var(--bg-sunken)]"
          >
            ←
          </Link>
          <span className="tnum px-2 font-medium">{monthLabel(first)}</span>
          <Link
            href={{ pathname: '/admin/calendar', query: { month: next } }}
            className="rounded-[var(--radius-md)] px-3 py-1.5 hover:bg-[var(--bg-sunken)]"
          >
            →
          </Link>
        </nav>
      </div>

      <ul className="flex flex-wrap gap-4 text-xs text-[var(--fg-muted)]">
        <Legend className="bg-[var(--cal-available)] border border-[var(--border-default)]" label={t('legend.free')} />
        <Legend className="bg-[var(--color-danger)]/70" label={t('legend.booked')} />
        <Legend className="bg-[var(--color-warning)]/70" label={t('legend.held')} />
        <Legend className="bg-[var(--color-ink-400)]" label={t('legend.blocked')} />
      </ul>

      {rows.length === 0 ? (
        <Card>
          <EmptyState title={t('noVillas')} />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {/* The grid scrolls sideways rather than wrapping. A month that
              wraps stops being a calendar. */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-40 bg-[var(--bg-surface)] p-2 text-left font-medium">
                    {t('villa')}
                  </th>
                  {days.map((day) => {
                    const weekday = weekdayOf(day);
                    return (
                      <th
                        key={day}
                        className={cn(
                          'tnum w-7 p-1 font-normal',
                          // Weekends carry the weekend rate, so they are the
                          // columns staff scan for first.
                          (weekday === 0 || weekday === 6) && 'bg-[var(--bg-sunken)]',
                          day === today && 'text-[var(--accent)] font-semibold',
                        )}
                      >
                        {Number(day.slice(8))}
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {rows.map((villa) => (
                  <tr key={villa.id} className="border-t border-[var(--border-default)]">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 max-w-40 truncate bg-[var(--bg-surface)] p-2 text-left font-normal"
                    >
                      <span className="tnum text-[var(--fg-muted)]">{villa.code}</span>
                      <span className="ml-2 truncate">{villa.name}</span>
                    </th>

                    {days.map((day) => {
                      const status = villa.days.get(day);
                      return (
                        <td
                          key={day}
                          title={`${villa.code} ${day}${status ? ` · ${t(`legend.${status === 'booked' ? 'booked' : status === 'held' ? 'held' : 'blocked'}`)}` : ''}`}
                          className={cn(
                            'h-7 border-l border-[var(--border-default)]',
                            statusClass(status),
                            day === today && 'ring-1 ring-inset ring-[var(--accent)]',
                          )}
                        />
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function statusClass(status: string | undefined): string {
  switch (status) {
    case 'booked':
      return 'bg-[var(--color-danger)]/70';
    case 'held':
      return 'bg-[var(--color-warning)]/70';
    case 'blocked':
    case 'maintenance':
      return 'bg-[var(--color-ink-400)]';
    default:
      return '';
  }
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className={cn('inline-block h-3 w-4 rounded-sm', className)} aria-hidden />
      {label}
    </li>
  );
}

function shiftMonth(month: string, by: number): string {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + by, 1));
  return shifted.toISOString().slice(0, 7);
}

function monthLabel(dateKey: string): string {
  return new Intl.DateTimeFormat('th-TH', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(`${dateKey}T00:00:00.000Z`));
}
