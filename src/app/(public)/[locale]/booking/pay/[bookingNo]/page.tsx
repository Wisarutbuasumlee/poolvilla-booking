import { Building2, QrCode } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import type { Locale } from '@/i18n/routing';
import { getBookingForPayment, holdSecondsLeft } from '@/lib/booking/queries';
import { SettingModel } from '@/lib/db/models/reference';
import { HoldCountdown } from '@/components/booking/hold-countdown';
import { SlipUpload } from '@/components/booking/slip-upload';
import { Badge, Card, Money } from '@/components/ui/surface';

export { generateStaticParams } from '@/i18n/static-params';

// A booking page is personal and must never be indexed or cached.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Pay the deposit.
 *
 * Shows the bank details, a PromptPay QR for the exact amount, and a slip
 * upload. The countdown above them is the honest part: these nights are held,
 * and the hold ends.
 */
export default async function PaymentPage({
  params,
}: {
  params: Promise<{ locale: Locale; bookingNo: string }>;
}) {
  const { locale, bookingNo } = await params;
  setRequestLocale(locale);

  const found = await getBookingForPayment(bookingNo);
  if (!found) notFound();

  const { booking, villa } = found;
  const t = await getTranslations('booking');
  const pay = await getTranslations('booking.pay');

  const settings = await SettingModel.findById('site').lean();
  const account = settings?.bankAccounts?.[0];

  const deposit = booking.priceBreakdown?.depositRequired ?? 0;
  const secondsLeft = holdSecondsLeft(booking.holdExpiresAt);
  const hasSlip = (booking.payment?.slips?.length ?? 0) > 0;

  const qr = account?.promptPayId ? await promptPayQr(account.promptPayId, deposit) : null;

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <header className="mb-5">
        <p className="tnum text-sm text-[var(--fg-muted)]">{booking.bookingNo}</p>
        <h1 className="text-xl font-semibold sm:text-2xl">{pay('title')}</h1>
        <p className="mt-1 text-sm text-[var(--fg-muted)]">
          {villa?.name?.th ?? booking.villaCodeSnapshot} · {booking.checkIn} ถึง {booking.checkOut}
          <span className="tnum"> ({booking.nights} คืน)</span>
        </p>
      </header>

      {booking.status === 'awaiting_payment' && secondsLeft !== null ? (
        <div className="mb-5">
          <HoldCountdown seconds={secondsLeft} expiredLabel={pay('expired')} />
        </div>
      ) : (
        <div className="mb-5">
          <Badge tone={booking.status === 'confirmed' ? 'success' : 'neutral'}>
            {t(`status.${booking.status}`)}
          </Badge>
        </div>
      )}

      <Card className="mb-5 p-5">
        <div className="flex items-baseline justify-between">
          <span className="text-[var(--fg-muted)]">{pay('amount')}</span>
          <Money satang={deposit} className="text-2xl font-semibold" />
        </div>
        <p className="mt-1 text-right text-sm text-[var(--fg-muted)]">
          {t('summary.total')} <Money satang={booking.priceBreakdown?.grandTotal ?? 0} /> ·{' '}
          {t('summary.balance')} <Money satang={booking.priceBreakdown?.balanceDue ?? 0} />
        </p>
      </Card>

      <div className="grid gap-5 sm:grid-cols-2">
        {account ? (
          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 font-medium">
              <Building2 className="h-4 w-4 text-[var(--fg-subtle)]" aria-hidden />
              {pay('transferTo')}
            </h2>
            <dl className="space-y-1 text-sm">
              <div>
                <dt className="text-[var(--fg-muted)]">{account.bankName}</dt>
                <dd className="font-medium">{account.accountName}</dd>
              </div>
              <div>
                <dd className="tnum select-all text-lg font-semibold">{account.accountNumber}</dd>
              </div>
            </dl>
          </Card>
        ) : null}

        {qr ? (
          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 font-medium">
              <QrCode className="h-4 w-4 text-[var(--fg-subtle)]" aria-hidden />
              {pay('promptpay')}
            </h2>
            {/* The amount is baked into the QR, so the guest cannot transfer
                the wrong figure by mistyping it. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt={pay('scanToPay')} width={220} height={220} className="mx-auto" />
          </Card>
        ) : null}
      </div>

      <div className="mt-6">
        <SlipUpload bookingNo={booking.bookingNo} alreadyUploaded={hasSlip} />
      </div>
    </main>
  );
}

/**
 * A PromptPay QR for an exact amount, as a data URL.
 *
 * Generated on the server so no QR library reaches the browser, and rendered
 * as a plain img rather than next/image: it is already a data URL, so there is
 * nothing for the image optimiser to do.
 */
async function promptPayQr(promptPayId: string, satang: number): Promise<string | null> {
  try {
    const [{ default: generatePayload }, { default: QRCode }] = await Promise.all([
      import('promptpay-qr'),
      import('qrcode'),
    ]);

    const payload = generatePayload(promptPayId, { amount: satang / 100 });
    return await QRCode.toDataURL(payload, { width: 440, margin: 1 });
  } catch {
    // A missing or malformed PromptPay id must not take the whole payment
    // page down; the bank details beside it still work.
    return null;
  }
}
