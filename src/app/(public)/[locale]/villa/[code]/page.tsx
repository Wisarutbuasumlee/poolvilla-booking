import {
  Bath,
  BedDouble,
  Car,
  CheckCircle2,
  MapPin,
  ShieldCheck,
  Users,
  Waves,
  XCircle,
} from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import type { Metadata } from 'next';

import type { Locale } from '@/i18n/routing';
import { getVillaByCode } from '@/lib/villas/public-queries';
import { getPricingContext } from '@/lib/rates/context';
import { getHolidaySet, getRateCard, type VillaRateSource } from '@/lib/rates/rate-cards';
import { getBlockedDates } from '@/lib/availability/service';
import { addDays, asDateKey, resolveNight, todayBangkok } from '@/lib/pricing';
import { AvailabilityCalendar, type CalendarNight } from '@/components/public/availability-calendar';
import { Badge, Card, Money, Skeleton } from '@/components/ui/surface';
import { buttonStyles } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export { generateStaticParams } from '@/i18n/static-params';

/**
 * One villa.
 *
 * The page splits deliberately. Everything above the price is villa content,
 * identical for every visitor. Everything that depends on the referral cookie
 * (the rates, the calendar) sits in its own Suspense boundary.
 *
 * That split is not a performance nicety. Without it, a cached render of this
 * page could serve one agent's prices to another agent's customer.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale; code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const villa = await getVillaByCode(code);
  if (!villa) return {};

  return {
    title: villa.name?.th ?? villa.code,
    description: villa.description?.th ?? undefined,
    // The query string carries the referral, which must never become the
    // canonical URL of the page.
    alternates: { canonical: `/villa/${villa.code}` },
  };
}

export default async function VillaPage({
  params,
}: {
  params: Promise<{ locale: Locale; code: string }>;
}) {
  const { locale, code } = await params;
  setRequestLocale(locale);

  const villa = await getVillaByCode(code);
  if (!villa) notFound();

  const t = await getTranslations('villa');
  const label = await getTranslations('common.label');

  const images = [...(villa.images ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const cover = images.find((image) => image.isCover) ?? images[0];

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="tnum text-sm text-[var(--fg-muted)]">{villa.code}</span>
          <span className="text-sm text-[var(--fg-muted)]">· {villa.location?.zone}</span>
          {villa.pool?.hasSlider ? <Badge tone="accent">{t('hasSlide')}</Badge> : null}
          {cover?.isSynthetic ? <Badge tone="warning">{t('placeholderPhotos')}</Badge> : null}
        </div>
        <h1 className="mt-1 text-xl font-semibold sm:text-2xl">{villa.name?.th ?? villa.code}</h1>
      </header>

      {/* One large image and a strip. A grid of equal thumbnails makes every
          house look the same; the pool is what sells this one. */}
      <section className="grid gap-2 sm:grid-cols-[2fr_1fr]">
        <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--radius-lg)] bg-[var(--bg-sunken)] sm:aspect-[3/2]">
          {cover ? (
            <Image
              src={cover.url}
              alt={villa.name?.th ?? villa.code}
              fill
              priority
              sizes="(min-width: 640px) 66vw, 100vw"
              className="object-cover"
              unoptimized
            />
          ) : null}
        </div>

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-2">
          {images.slice(1, 5).map((image) => (
            <div
              key={image.url}
              className="relative aspect-square overflow-hidden rounded-[var(--radius-md)] bg-[var(--bg-sunken)]"
            >
              <Image
                src={image.thumbUrl ?? image.url}
                alt=""
                fill
                sizes="(min-width: 640px) 20vw, 33vw"
                className="object-cover"
                unoptimized
              />
            </div>
          ))}
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 font-medium">{t('summary')}</h2>
            <ul className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Fact icon={<BedDouble className="h-4 w-4" />} value={villa.capacity?.bedrooms} unit={label('bedrooms')} />
              <Fact icon={<Bath className="h-4 w-4" />} value={villa.capacity?.bathrooms} unit={label('bathrooms')} />
              <Fact icon={<Users className="h-4 w-4" />} value={villa.capacity?.baseGuests} unit={t('guestsUnit')} />
              <Fact
                icon={<Waves className="h-4 w-4" />}
                value={villa.location?.distanceToBeachKm ?? undefined}
                unit="km"
              />
            </ul>

            <dl className="mt-4 grid gap-2 border-t border-[var(--border-default)] pt-4 text-sm sm:grid-cols-2">
              <Row
                icon={<Users className="h-4 w-4" />}
                term={t('extraGuest')}
                value={
                  <>
                    <Money satang={villa.capacity?.extraGuestFee ?? 0} />
                    <span className="text-[var(--fg-muted)]"> {t('perPersonPerNight')}</span>
                  </>
                }
              />
              <Row
                icon={<ShieldCheck className="h-4 w-4" />}
                term={t('damageDeposit')}
                value={
                  <>
                    <Money satang={villa.damageDeposit ?? 0} />
                    <span className="text-[var(--fg-muted)]"> {t('refundedOnCheckout')}</span>
                  </>
                }
              />
              <Row
                icon={<MapPin className="h-4 w-4" />}
                term={t('location')}
                value={`${villa.location?.landmark ?? villa.location?.zone ?? ''}`}
              />
              <Row
                icon={<Car className="h-4 w-4" />}
                term={t('parking')}
                value={t('parkingValue', {
                  house: villa.parking?.inHouse ?? 0,
                  garage: villa.parking?.garage ?? 0,
                })}
              />
            </dl>
          </Card>

          {villa.pool ? (
            <Card className="p-5">
              <h2 className="mb-3 font-medium">{t('pool')}</h2>
              <p className="text-sm text-[var(--fg-muted)]">
                {t('poolSummary', {
                  system: villa.pool.system === 'saltwater' ? t('saltwater') : t('chlorine'),
                  width: villa.pool.widthM ?? 0,
                  length: villa.pool.lengthM ?? 0,
                  depth: villa.pool.depthM ?? 0,
                })}
                {villa.pool.hasSlider
                  ? ` · ${t('slideHeight', { m: villa.pool.sliderHeightM ?? 0 })}`
                  : ''}
                {villa.pool.hasKidPool ? ` · ${t('kidsPool')}` : ''}
              </p>
            </Card>
          ) : null}

          {villa.bedroomDetails?.length ? (
            <Card className="p-5">
              <h2 className="mb-3 font-medium">{t('bedrooms')}</h2>
              <ul className="divide-y divide-[var(--border-default)] text-sm">
                {villa.bedroomDetails.map((room) => (
                  <li key={room.index} className="flex items-center gap-3 py-2">
                    <span className="font-medium">{t('bedroomNo', { n: room.index })}</span>
                    <span className="text-[var(--fg-muted)]">
                      {room.beds
                        ?.map((bed) => t('bedSpec', { size: bed.sizeFt, count: bed.count }))
                        .join(' + ')}
                    </span>
                    <span className="tnum ml-auto">{t('sleeps', { n: room.sleeps })}</span>
                    {room.hasEnsuite ? <Badge>{t('ensuite')}</Badge> : null}
                  </li>
                ))}
              </ul>
              {villa.extraMattressSleeps ? (
                <p className="mt-3 text-sm text-[var(--fg-muted)]">
                  {t('extraMattress', { n: villa.extraMattressSleeps })}
                </p>
              ) : null}
            </Card>
          ) : null}

          {villa.kitchen?.available?.length || villa.kitchen?.unavailable?.length ? (
            <Card className="p-5">
              <h2 className="mb-3 font-medium">{t('kitchen')}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <KitchenList
                  title={t('kitchenHas')}
                  items={villa.kitchen?.available ?? []}
                  positive
                />
                <KitchenList
                  title={t('kitchenLacks')}
                  items={villa.kitchen?.unavailable ?? []}
                />
              </div>
            </Card>
          ) : null}

          {villa.extraCharges?.length ? (
            <Card className="p-5">
              <h2 className="mb-3 font-medium">{t('extraCharges')}</h2>
              <ul className="divide-y divide-[var(--border-default)] text-sm">
                {villa.extraCharges.map((charge) => (
                  <li key={charge.key} className="flex items-center justify-between py-2">
                    <span>{charge.label?.th}</span>
                    <span>
                      <Money satang={charge.price} />
                      <span className="text-[var(--fg-muted)]"> / {charge.unit}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {villa.additionalNotes?.th ? (
            <Card className="p-5">
              <h2 className="mb-2 font-medium">{t('additionalNotes')}</h2>
              <p className="whitespace-pre-line text-sm text-[var(--fg-muted)]">
                {villa.additionalNotes.th}
              </p>
            </Card>
          ) : null}
        </div>

        {/* Everything below depends on who referred the visitor. */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Suspense fallback={<Skeleton className="h-64 w-full rounded-[var(--radius-lg)]" />}>
            <RatePanel villa={villa as unknown as VillaRateSource} code={villa.code} />
          </Suspense>
        </aside>
      </div>

      <section className="mt-8">
        <h2 className="mb-3 font-medium">{t('calendar')}</h2>
        <Card className="p-5">
          <Suspense fallback={<Skeleton className="h-72 w-full" />}>
            <Calendar villa={villa as unknown as VillaRateSource} />
          </Suspense>
        </Card>
      </section>
    </main>
  );
}

/** The rate table and the agent whose prices these are. */
async function RatePanel({ villa, code }: { villa: VillaRateSource; code: string }) {
  const t = await getTranslations('villa');
  const context = await getPricingContext();
  const card = { ...(await getRateCard(villa, context)), villaCode: code };

  const rows = [
    { key: 'sunThu', value: card.base.sunThu + card.markup.sunThu },
    { key: 'fri', value: card.base.fri + card.markup.fri },
    { key: 'sat', value: card.base.sat + card.markup.sat },
    { key: 'holiday', value: card.base.holiday + card.markup.holiday },
  ] as const;

  return (
    <Card className="p-5">
      <h2 className="mb-3 font-medium">{t('priceTable')}</h2>

      <ul className="divide-y divide-[var(--border-default)] text-sm">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center justify-between py-2">
            <span className="text-[var(--fg-muted)]">{t(`dayType.${row.key}`)}</span>
            <Money satang={row.value} className="font-medium" />
          </li>
        ))}
      </ul>

      {card.minNights > 1 ? (
        <p className="mt-3 text-sm text-[var(--fg-muted)]">
          {t('minNights', { n: card.minNights })}
        </p>
      ) : null}

      {/* The primary action on this page. It carries no dates: the booking
          page asks for them and prices them with the same engine, so there is
          nowhere for a date chosen here and a date priced there to diverge. */}
      <Link
        href={`/booking/${card.villaCode}`}
        className={cn(buttonStyles({ size: 'lg', block: true }), 'mt-4')}
      >
        {t('bookNow')}
      </Link>

      {context.agentName ? (
        <p className="mt-4 border-t border-[var(--border-default)] pt-3 text-sm">
          <span className="text-[var(--fg-muted)]">{t('yourAgent')} </span>
          <span className="font-medium">{context.agentName}</span>
          <span className="tnum text-[var(--fg-muted)]"> ({context.agentCode})</span>
        </p>
      ) : null}
    </Card>
  );
}

/** Two months of nights, priced and marked free or taken. */
async function Calendar({ villa }: { villa: VillaRateSource }) {
  const today = todayBangkok();
  const start = asDateKey(`${today.slice(0, 7)}-01`);
  const [year, month] = start.split('-').map(Number) as [number, number];
  const end = asDateKey(new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10));

  const context = await getPricingContext();
  const [card, holidays, blocked] = await Promise.all([
    getRateCard(villa, context),
    getHolidaySet(start, end),
    getBlockedDates(villa._id, start, end),
  ]);

  const months: { label: string; startWeekday: number; nights: CalendarNight[] }[] = [];

  for (const offset of [0, 1]) {
    const monthStart = asDateKey(
      new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 10),
    );
    const dayCount = new Date(Date.UTC(year, month + offset, 0)).getUTCDate();

    const nights: CalendarNight[] = [];
    for (let day = 0; day < dayCount; day += 1) {
      const date = addDays(monthStart, day);
      const line = resolveNight(date, card, holidays);
      nights.push({
        date,
        // A past night is not bookable however free the calendar says it is.
        available: date >= today && !blocked.has(date),
        price: line.price,
        isHoliday: line.dayType === 'HOLIDAY',
      });
    }

    months.push({
      label: new Intl.DateTimeFormat('th-TH', {
        month: 'long',
        year: 'numeric',
        timeZone: 'Asia/Bangkok',
      }).format(new Date(`${monthStart}T00:00:00.000Z`)),
      startWeekday: new Date(`${monthStart}T00:00:00.000Z`).getUTCDay(),
      nights,
    });
  }

  return <AvailabilityCalendar months={months} />;
}

function Fact({
  icon,
  value,
  unit,
}: {
  icon: React.ReactNode;
  value: number | undefined;
  unit: string;
}) {
  if (value === undefined || value === null) return null;
  return (
    <li className="flex items-center gap-2">
      <span className="text-[var(--fg-subtle)]">{icon}</span>
      <span className="tnum font-medium">{value}</span>
      <span className="text-[var(--fg-muted)]">{unit}</span>
    </li>
  );
}

function Row({
  icon,
  term,
  value,
}: {
  icon: React.ReactNode;
  term: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-[var(--fg-subtle)]">{icon}</span>
      <div>
        <dt className="text-[var(--fg-muted)]">{term}</dt>
        <dd>{value}</dd>
      </div>
    </div>
  );
}

function KitchenList({
  title,
  items,
  positive,
}: {
  title: string;
  items: string[];
  positive?: boolean;
}) {
  if (items.length === 0) return null;
  const Icon = positive ? CheckCircle2 : XCircle;

  return (
    <div>
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      <ul className="space-y-1 text-sm text-[var(--fg-muted)]">
        {items.map((item) => (
          <li key={item} className="flex items-center gap-1.5">
            <Icon
              className={cnIcon(positive)}
              aria-hidden
            />
            {KITCHEN_LABEL[item] ?? item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function cnIcon(positive?: boolean): string {
  return positive
    ? 'h-3.5 w-3.5 shrink-0 text-[var(--color-success)]'
    : 'h-3.5 w-3.5 shrink-0 text-[var(--fg-subtle)]';
}

/** Kitchen items are a fixed vocabulary shared with the villa form. */
const KITCHEN_LABEL: Record<string, string> = {
  pan: 'กระทะ',
  plates: 'จานชาม',
  spoons: 'ช้อน',
  glasses: 'แก้วน้ำ',
  chopping_board: 'เขียง',
  knives: 'มีด',
  mortar: 'ครก',
  microwave: 'ไมโครเวฟ',
  ice_bucket: 'ถังน้ำแข็ง',
  shabu_pot: 'หม้อชาบู',
  rice_cooker: 'หม้อหุงข้าว',
  pot: 'หม้อ',
  electric_stove: 'เตาไฟฟ้า',
  gas_stove: 'เตาแก๊ส',
  toaster: 'เตาปิ้งขนมปัง',
  steamer: 'ซึ้ง',
  blender: 'เครื่องปั่น',
};
