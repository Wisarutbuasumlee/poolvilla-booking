import { SearchX } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Metadata } from 'next';

import type { Locale } from '@/i18n/routing';
import { findBookingForGuest } from '@/lib/booking/queries';
import { BookingLookupSchema } from '@/lib/validation/booking';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Badge, Card, Money } from '@/components/ui/surface';

export { generateStaticParams } from '@/i18n/static-params';

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Booking lookup.
 *
 * There is no guest account, so this is how somebody checks what they booked.
 * It asks for the phone number as well as the booking number: a booking number
 * is short enough to guess at, and the number alone should not reveal a
 * stranger's name and travel dates.
 *
 * A plain GET form, so the result is a normal page load and works without
 * JavaScript.
 */
export default async function BookingLookupPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ bookingNo?: string; phone?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('booking');
  const lookup = await getTranslations('booking.lookup');
  const summary = await getTranslations('booking.summary');

  const raw = await searchParams;
  const submitted = Boolean(raw.bookingNo || raw.phone);
  const parsed = BookingLookupSchema.safeParse(raw);

  const found = parsed.success
    ? await findBookingForGuest(parsed.data.bookingNo, parsed.data.phone)
    : null;

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <h1 className="mb-5 text-xl font-semibold sm:text-2xl">{lookup('title')}</h1>

      <Card className="p-5">
        <form className="space-y-4">
          <Field label={lookup('bookingNo')} htmlFor="bookingNo" required>
            <Input
              id="bookingNo"
              name="bookingNo"
              className="tnum uppercase"
              placeholder="BK-20260908-0001"
              defaultValue={raw.bookingNo ?? ''}
              required
            />
          </Field>

          <Field label={lookup('phone')} htmlFor="phone" required>
            <Input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              defaultValue={raw.phone ?? ''}
              required
            />
          </Field>

          <Button type="submit" block>
            {lookup('submit')}
          </Button>
        </form>
      </Card>

      {/* One message for a wrong number and for a wrong phone. Telling the
          visitor which half was right would turn this into a way to confirm
          that a booking number exists. */}
      {submitted && !found ? (
        <p
          role="alert"
          className="mt-5 flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--bg-sunken)] p-4 text-sm text-[var(--fg-muted)]"
        >
          <SearchX className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {lookup('notFound')}
        </p>
      ) : null}

      {found ? (
        <Card className="mt-5 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="tnum text-sm text-[var(--fg-muted)]">{found.booking.bookingNo}</span>
            <Badge tone={statusTone(found.booking.status)}>
              {t(`status.${found.booking.status}`)}
            </Badge>
          </div>

          <h2 className="mt-1 font-medium">
            {found.villa?.name?.th ?? found.booking.villaCodeSnapshot}
          </h2>

          <dl className="mt-4 space-y-1 text-sm">
            <Row term={t('checkIn')} value={`${found.booking.checkIn} ${found.villa?.rules?.checkInFrom ?? ''}`} />
            <Row term={t('checkOut')} value={`${found.booking.checkOut} ${found.villa?.rules?.checkOutBefore ?? ''}`} />
            <Row term={t('adults')} value={String(found.booking.guests?.totalGuests ?? '')} />

            <div className="flex justify-between border-t border-[var(--border-default)] pt-2 font-medium">
              <dt>{summary('total')}</dt>
              <dd>
                <Money satang={found.booking.priceBreakdown?.grandTotal ?? 0} />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--fg-muted)]">{summary('deposit')}</dt>
              <dd>
                <Money satang={found.booking.priceBreakdown?.depositRequired ?? 0} />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--fg-muted)]">{summary('balance')}</dt>
              <dd>
                <Money satang={found.booking.priceBreakdown?.balanceDue ?? 0} />
              </dd>
            </div>
            <div className="flex justify-between pt-2 text-[var(--fg-muted)]">
              <dt>{summary('damageDeposit')}</dt>
              <dd>
                <Money satang={found.booking.priceBreakdown?.damageDeposit ?? 0} />
              </dd>
            </div>
          </dl>
        </Card>
      ) : null}
    </main>
  );
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-[var(--fg-muted)]">{term}</dt>
      <dd className="tnum">{value}</dd>
    </div>
  );
}

function statusTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'confirmed' || status === 'checked_in' || status === 'completed') return 'success';
  if (status === 'awaiting_payment' || status === 'pending') return 'warning';
  if (status === 'cancelled' || status === 'expired' || status === 'no_show') return 'danger';
  return 'neutral';
}
