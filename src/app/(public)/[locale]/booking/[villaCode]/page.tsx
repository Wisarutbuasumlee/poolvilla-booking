import { AlertCircle } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import type { Locale } from '@/i18n/routing';
import { getVillaByCode } from '@/lib/villas/public-queries';
import { getPricingContext } from '@/lib/rates/context';
import { getHolidaySet, getRateCard, villaCapacity, type VillaRateSource } from '@/lib/rates/rate-cards';
import { getBlockedDates } from '@/lib/availability/service';
import { SettingModel } from '@/lib/db/models/reference';
import { asDateKey, eachNight, isDateKey, quote, todayBangkok } from '@/lib/pricing';
import { BookingForm } from '@/components/booking/booking-form';
import { Card } from '@/components/ui/surface';

export { generateStaticParams } from '@/i18n/static-params';

/**
 * The booking page.
 *
 * Dates and guest counts come from the URL, so the price shown is computed by
 * the same engine that will price the booking itself. There is no second
 * pricing implementation in the browser to drift from the first: changing the
 * dates re-navigates, and the server recalculates.
 *
 * That also means this page works with JavaScript disabled, which matters more
 * than it sounds on a Thai phone with a patchy connection.
 */
export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale; villaCode: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale, villaCode } = await params;
  setRequestLocale(locale);

  const villa = await getVillaByCode(villaCode);
  if (!villa) notFound();

  const t = await getTranslations('booking');
  const raw = await searchParams;

  const today = todayBangkok();
  const checkIn = isDateKey(raw.checkIn) && raw.checkIn >= today ? asDateKey(raw.checkIn) : null;
  const checkOut =
    checkIn && isDateKey(raw.checkOut) && raw.checkOut > checkIn ? asDateKey(raw.checkOut) : null;

  const adults = clamp(Number(raw.adults ?? villa.capacity?.baseGuests ?? 2), 1, 60);
  const children = clamp(Number(raw.children ?? 0), 0, 40);
  const childrenUnder10 = clamp(Number(raw.childrenUnder10 ?? 0), 0, children);

  const source = villa as unknown as VillaRateSource;
  const context = await getPricingContext();

  const [rateCard, settings] = await Promise.all([
    getRateCard(source, context),
    SettingModel.findById('site').lean(),
  ]);

  let priced = null;
  let unavailableDates: string[] = [];

  if (checkIn && checkOut) {
    const [holidays, blocked] = await Promise.all([
      getHolidaySet(checkIn, checkOut),
      getBlockedDates(villa._id, checkIn, checkOut),
    ]);

    // Checked before pricing, so a guest never fills in a form for nights
    // somebody else already holds.
    unavailableDates = eachNight(checkIn, checkOut).filter((night) => blocked.has(night));

    priced = quote({
      checkIn,
      checkOut,
      rateCard,
      capacity: villaCapacity(source),
      holidays,
      guests: { adults, children, childrenUnder10 },
      settings: { depositPercent: settings?.depositPercent ?? 30, currency: 'THB' },
    });
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-5">
        <p className="tnum text-sm text-[var(--fg-muted)]">{villa.code}</p>
        <h1 className="text-xl font-semibold sm:text-2xl">{villa.name?.th ?? villa.code}</h1>
      </header>

      {unavailableDates.length > 0 ? (
        <Card className="mb-5 border-[var(--color-danger)] p-4">
          <p className="flex items-start gap-2 text-sm text-[var(--color-danger)]">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {t('unavailable', { dates: unavailableDates.join(', ') })}
          </p>
        </Card>
      ) : null}

      <BookingForm
        villaCode={villa.code}
        checkIn={checkIn}
        checkOut={checkOut}
        adults={adults}
        childCount={children}
        childrenUnder10={childrenUnder10}
        maxGuests={(villa.capacity?.baseGuests ?? 0) + (villa.capacity?.maxExtraGuests ?? 0)}
        extraCharges={(villa.extraCharges ?? []).map((charge) => ({
          key: charge.key,
          label: charge.label?.th ?? charge.key,
          price: charge.price,
          unit: charge.unit,
        }))}
        quote={priced ? serialiseForClient(priced) : null}
        blocked={unavailableDates.length > 0}
        cancellationPolicy={settings?.cancellationPolicy?.th ?? ''}
      />
    </main>
  );
}

/** Only what the summary renders. The client never needs the whole quote. */
function serialiseForClient(priced: ReturnType<typeof quote>) {
  return {
    nights: priced.nights,
    lines: priced.lines.map((line) => ({
      date: line.date,
      dayType: line.dayType,
      price: line.price,
    })),
    accommodationTotal: priced.accommodationTotal,
    extraGuestTotal: priced.extraGuestTotal,
    extraGuests: priced.guests.extraGuests,
    freeChildrenApplied: priced.guests.freeChildrenApplied,
    grandTotal: priced.grandTotal,
    damageDeposit: priced.damageDeposit,
    depositRequired: priced.depositRequired,
    balanceDue: priced.balanceDue,
    minNights: priced.minNights,
    violations: priced.violations.map((violation) => ({
      code: violation.code,
      meta: violation.meta,
    })),
    isBookable: priced.isBookable,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.trunc(value), min), max);
}
