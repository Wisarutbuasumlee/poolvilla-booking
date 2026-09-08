import { Bath, BedDouble, Users, Waves } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import { Badge, Money } from '@/components/ui/surface';

/**
 * One villa in a list.
 *
 * Takes a fully computed price as a prop and fetches nothing. A card that
 * queried for its own price would turn a twenty-result page into forty
 * queries, which is the exact cost the batched rate cards exist to avoid.
 */

export interface VillaCardData {
  code: string;
  name: string;
  zone: string;
  bedrooms: number;
  bathrooms: number;
  baseGuests: number;
  hasSlider: boolean;
  distanceToBeachKm: number | null;
  coverUrl: string | null;
  coverIsSynthetic: boolean;
  /** Total for the chosen dates, or the nightly "from" price when none. */
  price: number;
  priceIsTotal: boolean;
  nights: number;
}

export function VillaCard({ villa, priority }: { villa: VillaCardData; priority?: boolean }) {
  const t = useTranslations('common.label');
  const v = useTranslations('common.villaCard');

  return (
    <Link
      href={`/villa/${villa.code}`}
      className="group block overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-float)]"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-[var(--bg-sunken)]">
        {villa.coverUrl ? (
          <Image
            src={villa.coverUrl}
            alt={villa.name}
            fill
            // Two up on a phone, four on a wide screen. Getting this wrong is
            // the difference between a 40KB and a 400KB card on 4G.
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            priority={priority}
            unoptimized
          />
        ) : null}

        <div className="absolute left-2 top-2 flex gap-1">
          {villa.hasSlider ? <Badge tone="accent">{v('slide')}</Badge> : null}
          {/* A placeholder must announce itself. Letting one pass as a
              photograph of a real house is the worst thing this card can do. */}
          {villa.coverIsSynthetic ? <Badge tone="warning">{v('placeholder')}</Badge> : null}
        </div>
      </div>

      <div className="space-y-2 p-3 sm:p-4">
        <div className="flex items-baseline gap-2">
          <span className="tnum text-xs text-[var(--fg-muted)]">{villa.code}</span>
          <span className="truncate text-xs text-[var(--fg-muted)]">{villa.zone}</span>
        </div>

        <h3 className="line-clamp-2 font-medium leading-snug">{villa.name}</h3>

        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--fg-muted)]">
          <li className="flex items-center gap-1">
            <BedDouble className="h-4 w-4" aria-hidden />
            <span className="tnum">{villa.bedrooms}</span>
          </li>
          <li className="flex items-center gap-1">
            <Bath className="h-4 w-4" aria-hidden />
            <span className="tnum">{villa.bathrooms}</span>
          </li>
          <li className="flex items-center gap-1">
            <Users className="h-4 w-4" aria-hidden />
            <span className="tnum">{villa.baseGuests}</span>
          </li>
          {villa.distanceToBeachKm !== null ? (
            <li className="flex items-center gap-1">
              <Waves className="h-4 w-4" aria-hidden />
              <span className="tnum">{villa.distanceToBeachKm}</span> km
            </li>
          ) : null}
        </ul>

        {/* The price is the heaviest thing on the card. A guest scanning a
            grid reads price first and everything else second. */}
        <p className="pt-1">
          {villa.priceIsTotal ? (
            <>
              <Money satang={villa.price} className="text-lg font-semibold" />
              <span className="ml-1 text-sm text-[var(--fg-muted)]">
                {v('forNights', { n: villa.nights })}
              </span>
            </>
          ) : (
            <>
              <span className="text-sm text-[var(--fg-muted)]">{t('from')} </span>
              <Money satang={villa.price} className="text-lg font-semibold" />
              <span className="ml-1 text-sm text-[var(--fg-muted)]">{t('perNight')}</span>
            </>
          )}
        </p>
      </div>
    </Link>
  );
}
