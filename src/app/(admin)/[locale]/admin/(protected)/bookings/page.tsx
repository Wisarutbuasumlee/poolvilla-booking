import { ClipboardList, Download, ExternalLink } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Types } from 'mongoose';

import type { Locale } from '@/i18n/routing';
import { requireActor } from '@/lib/auth/rbac';
import { connectToDatabase } from '@/lib/db/connect';
import { BookingModel } from '@/lib/db/models/booking';
import { BookingActions } from '@/components/admin/booking-actions';
import { buttonStyles } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { Badge, Card, EmptyState, Money } from '@/components/ui/surface';
import { cn } from '@/lib/utils';

export { generateStaticParams } from '@/i18n/static-params';

const STATUSES = [
  'awaiting_payment',
  'confirmed',
  'checked_in',
  'completed',
  'cancelled',
  'expired',
  'no_show',
] as const;

/**
 * The booking list.
 *
 * Ordered by check-in, not by when the booking was made: staff work forwards
 * through arrivals. Slips awaiting review float to the top of the default view
 * because that is the queue somebody is paid to clear.
 *
 * Agents see only their own bookings, and the scoping is in the query.
 */
export default async function AdminBookingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const actor = await requireActor();
  const t = await getTranslations('admin.bookings');
  const bookingT = await getTranslations('booking');

  const raw = await searchParams;
  const status = STATUSES.includes(raw.status as (typeof STATUSES)[number])
    ? raw.status
    : undefined;

  await connectToDatabase();

  const query: Record<string, unknown> = {};
  if (actor.role === 'agent') {
    query.agentId = actor.agentId ? new Types.ObjectId(actor.agentId) : null;
  }
  if (status) query.status = status;
  if (raw.q) {
    const term = raw.q.trim();
    query.$or = [
      { bookingNo: new RegExp(escapeRegex(term), 'i') },
      { 'customer.phone': new RegExp(escapeRegex(term), 'i') },
      { 'customer.name': new RegExp(escapeRegex(term), 'i') },
      { villaCodeSnapshot: new RegExp(escapeRegex(term), 'i') },
    ];
  }

  const bookings = await BookingModel.find(query)
    .sort({ 'payment.depositStatus': 1, checkIn: 1 })
    .limit(100)
    .lean();

  const canAct = actor.role !== 'agent';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{t('title')}</h1>

        <form className="ml-auto flex flex-wrap gap-2">
          <input
            name="q"
            defaultValue={raw.q ?? ''}
            placeholder={t('searchPlaceholder')}
            className="h-9 w-52 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-sm"
          />
          <Select name="status" defaultValue={status ?? ''} className="h-9 w-40 text-sm">
            <option value="">{t('anyStatus')}</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {bookingT(`status.${value}`)}
              </option>
            ))}
          </Select>
          <button type="submit" className={buttonStyles({ size: 'sm', variant: 'secondary' })}>
            {t('filter')}
          </button>
        </form>

        {canAct ? (
          <a
            href="/api/reports/bookings.csv"
            className={buttonStyles({ size: 'sm', variant: 'ghost' })}
          >
            <Download className="h-4 w-4" aria-hidden />
            {t('exportCsv')}
          </a>
        ) : null}
      </div>

      {bookings.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardList className="h-8 w-8" aria-hidden />}
            title={t('empty.title')}
            body={t('empty.body')}
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {bookings.map((booking) => (
            <li key={booking.bookingNo}>
              <Card className="p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tnum text-sm text-[var(--fg-muted)]">
                        {booking.bookingNo}
                      </span>
                      <Badge tone={statusTone(booking.status)}>
                        {bookingT(`status.${booking.status}`)}
                      </Badge>
                      {booking.payment?.depositStatus === 'pending_review' ? (
                        <Badge tone="warning">{t('slipPending')}</Badge>
                      ) : null}
                      {booking.agentCodeSnapshot ? (
                        <Badge tone="accent">
                          {t('viaAgent', { code: booking.agentCodeSnapshot })}
                        </Badge>
                      ) : null}
                    </div>

                    <p className="tnum mt-1 text-sm">
                      {booking.villaCodeSnapshot} · {booking.checkIn} → {booking.checkOut} (
                      {booking.nights})
                    </p>
                    <p className="truncate text-sm text-[var(--fg-muted)]">
                      {booking.customer?.name} · {booking.customer?.phone}
                      {booking.customer?.lineId ? ` · LINE ${booking.customer.lineId}` : ''}
                    </p>
                  </div>

                  <div className="text-right text-sm">
                    <Money satang={booking.priceBreakdown?.grandTotal ?? 0} className="block font-semibold" />
                    <span className="text-[var(--fg-muted)]">
                      {t('deposit')} <Money satang={booking.priceBreakdown?.depositRequired ?? 0} />
                    </span>
                  </div>
                </div>

                {/* The slips, if any. Staff compare the amount on the image to
                    the deposit above before confirming. */}
                {booking.payment?.slips?.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {booking.payment.slips.map((slip) => (
                      <a
                        key={slip.url}
                        href={slip.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className={cn(
                          buttonStyles({ size: 'sm', variant: 'secondary' }),
                          'text-[var(--fg-muted)]',
                        )}
                      >
                        <ExternalLink className="h-4 w-4" aria-hidden />
                        {t('viewSlip')}
                      </a>
                    ))}
                  </div>
                ) : null}

                {canAct ? (
                  <div className="mt-3 border-t border-[var(--border-default)] pt-3">
                    <BookingActions
                      bookingId={String(booking._id)}
                      status={booking.status}
                      depositStatus={booking.payment?.depositStatus ?? 'unpaid'}
                      balanceStatus={booking.payment?.balanceStatus ?? 'unpaid'}
                    />
                  </div>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function statusTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (['confirmed', 'checked_in', 'completed'].includes(status)) return 'success';
  if (['awaiting_payment', 'pending'].includes(status)) return 'warning';
  if (['cancelled', 'expired', 'no_show'].includes(status)) return 'danger';
  return 'neutral';
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
