import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';
import type { DateKey } from '@/lib/pricing';

/**
 * Two months of availability, with the price on every free night.
 *
 * Rendered on the server: it is a table of facts, not an interaction, and
 * shipping a date library to the browser to draw it would cost more than the
 * whole page.
 *
 * A night is either free or it is not. There is no "provisional" shading,
 * because a hold that has expired reads as free everywhere else in the system
 * and this must agree with it.
 */

export interface CalendarNight {
  date: DateKey;
  available: boolean;
  price: number;
  isHoliday: boolean;
}

export async function AvailabilityCalendar({
  months,
}: {
  months: { label: string; startWeekday: number; nights: CalendarNight[] }[];
}) {
  const t = await getTranslations('villa');
  const weekdays = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {months.map((month) => (
        <div key={month.label}>
          <h3 className="mb-2 font-medium">{month.label}</h3>

          <div className="grid grid-cols-7 gap-1 text-center">
            {weekdays.map((day) => (
              <div key={day} className="pb-1 text-xs text-[var(--fg-subtle)]">
                {day}
              </div>
            ))}

            {/* Leading blanks so the first of the month lands on its weekday. */}
            {Array.from({ length: month.startWeekday }, (_, i) => (
              <div key={`pad-${i}`} />
            ))}

            {month.nights.map((night) => (
              <div
                key={night.date}
                className={cn(
                  'rounded-[var(--radius-sm)] py-1.5 text-xs leading-tight',
                  night.available
                    ? 'bg-[var(--cal-available)] text-[var(--cal-available-fg)]'
                    : 'bg-[var(--cal-booked)] text-[var(--cal-booked-fg)] line-through',
                )}
              >
                <span className="tnum block font-medium">{Number(night.date.slice(8))}</span>
                {night.available ? (
                  <span
                    className={cn(
                      'tnum block text-[10px]',
                      night.isHoliday ? 'text-[var(--cal-promo-fg)]' : 'text-[var(--fg-muted)]',
                    )}
                  >
                    {Math.round(night.price / 100).toLocaleString('en-US')}
                  </span>
                ) : (
                  <span className="block text-[10px]">{t('full')}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
