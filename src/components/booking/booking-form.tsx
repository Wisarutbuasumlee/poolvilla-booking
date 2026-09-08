'use client';

import { AlertCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useActionState, useState } from 'react';
import { createBookingAction, type BookingResult } from '@/lib/booking/actions';
import { Button } from '@/components/ui/button';
import { Field, Input, Label } from '@/components/ui/field';
import { Card, Money } from '@/components/ui/surface';

/**
 * The booking form.
 *
 * Dates and guest counts navigate rather than holding local state, so the
 * price beside them is always the one the server computed. Duplicating the
 * pricing rules here to avoid a round trip is how the number on screen and the
 * number charged drift apart.
 */

export interface ClientQuote {
  nights: number;
  lines: { date: string; dayType: string; price: number }[];
  accommodationTotal: number;
  extraGuestTotal: number;
  extraGuests: number;
  freeChildrenApplied: number;
  grandTotal: number;
  damageDeposit: number;
  depositRequired: number;
  balanceDue: number;
  minNights: { value: number; source: string };
  violations: { code: string; meta: Record<string, unknown> }[];
  isBookable: boolean;
}

export function BookingForm({
  villaCode,
  checkIn,
  checkOut,
  adults,
  childCount,
  childrenUnder10,
  maxGuests,
  extraCharges,
  quote,
  blocked,
  cancellationPolicy,
}: {
  villaCode: string;
  checkIn: string | null;
  checkOut: string | null;
  adults: number;
  /** Renamed from children: React reserves that prop name. */
  childCount: number;
  childrenUnder10: number;
  maxGuests: number;
  extraCharges: { key: string; label: string; price: number; unit: string }[];
  quote: ClientQuote | null;
  blocked: boolean;
  cancellationPolicy: string;
}) {
  const t = useTranslations('booking');
  const router = useRouter();
  const [addOns, setAddOns] = useState<Record<string, number>>({});

  const [state, formAction, pending] = useActionState<BookingResult | null, FormData>(
    (_previous, formData) => createBookingAction(formData),
    null,
  );

  const errors = state && !state.ok && state.code === 'INVALID' ? state.errors : {};

  /** Any change to dates or guests goes back through the server. */
  function reprice(patch: Record<string, string>) {
    const query = new URLSearchParams({
      ...(checkIn ? { checkIn } : {}),
      ...(checkOut ? { checkOut } : {}),
      adults: String(adults),
      children: String(childCount),
      childrenUnder10: String(childrenUnder10),
      ...patch,
    });
    router.replace(`/booking/${villaCode}?${query.toString()}`);
  }

  const addOnTotal = extraCharges.reduce(
    (total, charge) => total + charge.price * (addOns[charge.key] ?? 0),
    0,
  );

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="villaCode" value={villaCode} />
      <input type="hidden" name="checkIn" value={checkIn ?? ''} />
      <input type="hidden" name="checkOut" value={checkOut ?? ''} />
      <input type="hidden" name="adults" value={adults} />
      <input type="hidden" name="children" value={childCount} />
      <input type="hidden" name="childrenUnder10" value={childrenUnder10} />
      <input
        type="hidden"
        name="addOnsJson"
        value={JSON.stringify(
          Object.entries(addOns)
            .filter(([, qty]) => qty > 0)
            .map(([key, qty]) => ({ key, qty })),
        )}
      />
      {/* Sent so the server can warn when its own total disagrees. It is
          never used as the amount owed. */}
      <input type="hidden" name="displayedTotal" value={quote?.grandTotal ?? 0} />

      {state && !state.ok && state.code !== 'INVALID' ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {state.code === 'UNAVAILABLE'
            ? t('unavailable', { dates: state.conflictingDates.join(', ') })
            : state.code === 'PRICE_CHANGED'
              ? t('priceChanged', { total: Math.round(state.newTotal / 100).toLocaleString('en-US') })
              : state.message}
        </p>
      ) : null}

      <Card className="p-5">
        <h2 className="mb-4 font-medium">{t('steps.dates')}</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('checkIn')} htmlFor="checkInPicker" required>
            <Input
              id="checkInPicker"
              type="date"
              className="tnum"
              value={checkIn ?? ''}
              onChange={(event) => reprice({ checkIn: event.target.value })}
            />
          </Field>
          <Field label={t('checkOut')} htmlFor="checkOutPicker" required>
            <Input
              id="checkOutPicker"
              type="date"
              className="tnum"
              min={checkIn ?? undefined}
              value={checkOut ?? ''}
              onChange={(event) => reprice({ checkOut: event.target.value })}
            />
          </Field>
          <Field label={t('adults')} htmlFor="adultsPicker" required>
            <Input
              id="adultsPicker"
              type="number"
              min={1}
              max={maxGuests}
              className="tnum"
              value={adults}
              onChange={(event) => reprice({ adults: event.target.value })}
            />
          </Field>
          <Field
            label={t('children')}
            htmlFor="childrenPicker"
            hint={t('childrenHint')}
          >
            <Input
              id="childrenPicker"
              type="number"
              min={0}
              max={maxGuests}
              className="tnum"
              value={childCount}
              onChange={(event) => reprice({ children: event.target.value })}
            />
          </Field>
          <Field label={t('childrenUnder10')} htmlFor="under10Picker">
            <Input
              id="under10Picker"
              type="number"
              min={0}
              max={childCount}
              className="tnum"
              value={childrenUnder10}
              onChange={(event) => reprice({ childrenUnder10: event.target.value })}
            />
          </Field>
        </div>
      </Card>

      {extraCharges.length > 0 ? (
        <Card className="p-5">
          <h2 className="mb-3 font-medium">{t('addOns')}</h2>
          <ul className="space-y-3">
            {extraCharges.map((charge) => (
              <li key={charge.key} className="flex items-center gap-3">
                <span className="flex-1 text-sm">
                  {charge.label}
                  <span className="text-[var(--fg-muted)]">
                    {' '}
                    <Money satang={charge.price} /> / {charge.unit}
                  </span>
                </span>
                <Input
                  type="number"
                  min={0}
                  max={50}
                  className="tnum w-20"
                  aria-label={charge.label}
                  value={addOns[charge.key] ?? 0}
                  onChange={(event) =>
                    setAddOns((current) => ({
                      ...current,
                      [charge.key]: Math.max(0, Number(event.target.value) || 0),
                    }))
                  }
                />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="p-5">
        <h2 className="mb-4 font-medium">{t('steps.details')}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('name')} htmlFor="name" required error={errors.name}>
            <Input id="name" name="name" autoComplete="name" required />
          </Field>
          <Field label={t('phone')} htmlFor="phone" required error={errors.phone}>
            <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required />
          </Field>
          <Field label={t('lineId')} htmlFor="lineId" error={errors.lineId}>
            <Input id="lineId" name="lineId" />
          </Field>
          <Field label={t('email')} htmlFor="email" error={errors.email}>
            <Input id="email" name="email" type="email" autoComplete="email" />
          </Field>
          <div className="sm:col-span-2">
            <Field label={t('promoCode')} htmlFor="promoCode">
              <Input id="promoCode" name="promoCode" className="uppercase" />
            </Field>
          </div>
        </div>
      </Card>

      {quote ? <Summary quote={quote} addOnTotal={addOnTotal} /> : null}

      <Card className="p-5">
        <Label className="flex cursor-pointer items-start gap-3 font-normal">
          <input
            type="checkbox"
            name="acceptedTerms"
            value="true"
            required
            className="mt-1 h-4 w-4 accent-[var(--accent)]"
          />
          <span className="text-sm">
            {t('acceptTerms')}
            {cancellationPolicy ? (
              <span className="mt-1 block text-[var(--fg-muted)]">{cancellationPolicy}</span>
            ) : null}
          </span>
        </Label>
        {errors.acceptedTerms ? (
          <p className="mt-2 text-sm text-[var(--color-danger)]">{errors.acceptedTerms}</p>
        ) : null}
      </Card>

      <Button
        type="submit"
        size="lg"
        block
        // Blocked dates or a broken minimum-night rule make the button useless
        // rather than hidden: the guest can still see what would have to change.
        disabled={pending || !quote || blocked || !quote.isBookable}
      >
        {pending ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}

function Summary({ quote, addOnTotal }: { quote: ClientQuote; addOnTotal: number }) {
  const t = useTranslations('booking.summary');
  const b = useTranslations('booking');

  return (
    <Card className="p-5">
      <h2 className="mb-3 font-medium">{b('steps.review')}</h2>

      {/* Every night, priced. A total with no explanation is the thing guests
          argue about; a list they can check is the thing they trust. */}
      <ul className="mb-3 space-y-1 text-sm">
        {quote.lines.map((line) => (
          <li key={line.date} className="flex justify-between">
            <span className="tnum text-[var(--fg-muted)]">{line.date}</span>
            <Money satang={line.price} />
          </li>
        ))}
      </ul>

      <dl className="space-y-1 border-t border-[var(--border-default)] pt-3 text-sm">
        <Line term={t('accommodation')} value={quote.accommodationTotal} />
        {quote.extraGuests > 0 ? (
          <Line term={`${t('extraGuest')} (${quote.extraGuests})`} value={quote.extraGuestTotal} />
        ) : null}
        {addOnTotal > 0 ? <Line term={t('addOns')} value={addOnTotal} /> : null}

        <div className="flex justify-between border-t border-[var(--border-default)] pt-2 text-base font-semibold">
          <dt>{t('total')}</dt>
          <dd>
            <Money satang={quote.grandTotal + addOnTotal} />
          </dd>
        </div>

        <Line term={t('deposit')} value={quote.depositRequired} />
        <Line term={t('balance')} value={quote.balanceDue} muted />

        {/* Separated on purpose. It is held, not charged, and putting it inside
            the total is how a guest thinks they were overcharged. */}
        <div className="flex justify-between pt-2 text-[var(--fg-muted)]">
          <dt>{t('damageDeposit')}</dt>
          <dd>
            <Money satang={quote.damageDeposit} />
          </dd>
        </div>
      </dl>

      {quote.violations.length > 0 ? (
        <p className="mt-3 rounded-[var(--radius-md)] bg-[var(--color-warning)]/12 p-3 text-sm text-[var(--color-warning)]">
          {quote.violations
            .map((violation) =>
              violation.code === 'MIN_NIGHTS'
                ? b('minNightsViolation', { n: Number(violation.meta.required) })
                : violation.code === 'OVER_CAPACITY'
                  ? b('overCapacity', { n: Number(violation.meta.maximum) })
                  : b('promoNotApplied'),
            )
            .join(' · ')}
        </p>
      ) : null}
    </Card>
  );
}

function Line({ term, value, muted }: { term: string; value: number; muted?: boolean }) {
  return (
    <div className={`flex justify-between${muted ? ' text-[var(--fg-muted)]' : ''}`}>
      <dt>{term}</dt>
      <dd>
        <Money satang={value} />
      </dd>
    </div>
  );
}
