import { ArrowLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { requireRole } from '@/lib/auth/rbac';
import { getVillaForEdit } from '@/lib/villas/queries';
import { VillaForm, type VillaFormValues } from '@/components/admin/villa-form';
import { ImageManager } from '@/components/admin/image-manager';
import { Card } from '@/components/ui/surface';

export { generateStaticParams } from '@/i18n/static-params';

/**
 * Create and edit, on one route.
 *
 * `/admin/villas/new` and `/admin/villas/<id>` render the same form. Splitting
 * them into two routes duplicates every field and lets the two drift apart,
 * which is how a field ends up editable but not creatable.
 */
export default async function VillaEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale; id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const actor = await requireRole('superadmin', 'staff');
  const t = await getTranslations('admin.villas');

  const isNew = id === 'new';
  const villa = isNew ? null : await getVillaForEdit(actor, id);
  if (!isNew && !villa) notFound();

  const { saved } = await searchParams;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/villas"
          className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] text-[var(--fg-muted)] hover:bg-[var(--bg-sunken)]"
          aria-label={t('backToList')}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </Link>
        <div>
          <h1 className="text-xl font-semibold">
            {isNew ? t('newTitle') : (villa!.name?.th ?? villa!.code)}
          </h1>
          {!isNew ? (
            <p className="tnum text-sm text-[var(--fg-muted)]">{villa!.code}</p>
          ) : null}
        </div>
      </div>

      <VillaForm
        villaId={isNew ? null : id}
        justSaved={saved === '1'}
        values={toFormValues(villa)}
      />

      {/* Photos are only manageable once the villa exists: an upload has to
          have somewhere to attach itself. */}
      {isNew ? null : (
        <Card className="p-5">
          <ImageManager
            villaId={id}
            initialImages={(villa!.images ?? []).map((image) => ({
              url: image.url,
              thumbUrl: image.thumbUrl ?? undefined,
              isCover: Boolean(image.isCover),
              isSynthetic: Boolean(image.isSynthetic),
            }))}
          />
        </Card>
      )}
    </div>
  );
}

/** Defaults chosen so a brand-new villa is realistic rather than all zeroes. */
function toFormValues(villa: Awaited<ReturnType<typeof getVillaForEdit>>): VillaFormValues {
  return {
    code: villa?.code ?? '',
    slug: villa?.slug ?? '',
    status: (villa?.status as VillaFormValues['status']) ?? 'draft',
    name: { th: villa?.name?.th ?? '', en: u(villa?.name?.en), zh: u(villa?.name?.zh) },
    description: villa?.description
      ? {
          th: u(villa.description.th),
          en: u(villa.description.en),
          zh: u(villa.description.zh),
        }
      : undefined,
    location: {
      province: villa?.location?.province ?? 'ชลบุรี',
      district: u(villa?.location?.district),
      zone: villa?.location?.zone ?? 'พัทยา',
      landmark: u(villa?.location?.landmark),
      distanceToBeachKm: u(villa?.location?.distanceToBeachKm),
      googleMapUrl: u(villa?.location?.googleMapUrl),
    },
    capacity: {
      bedrooms: villa?.capacity?.bedrooms ?? 3,
      bathrooms: villa?.capacity?.bathrooms ?? 2,
      baseGuests: villa?.capacity?.baseGuests ?? 8,
      maxExtraGuests: villa?.capacity?.maxExtraGuests ?? 6,
      extraGuestFee: villa?.capacity?.extraGuestFee ?? 20000,
      freeChildUnder10Quota: villa?.capacity?.freeChildUnder10Quota ?? 4,
    },
    basePricing: {
      sunThu: villa?.basePricing?.sunThu ?? 800000,
      fri: villa?.basePricing?.fri ?? 1000000,
      sat: villa?.basePricing?.sat ?? 1200000,
      holiday: villa?.basePricing?.holiday ?? 1400000,
    },
    minNights: villa?.minNights ?? 1,
    damageDeposit: villa?.damageDeposit ?? 300000,
    pool: {
      isPrivate: villa?.pool?.isPrivate ?? true,
      system: (villa?.pool?.system as 'chlorine' | 'saltwater') ?? 'chlorine',
      widthM: u(villa?.pool?.widthM),
      lengthM: u(villa?.pool?.lengthM),
      depthM: u(villa?.pool?.depthM),
      hasSlider: villa?.pool?.hasSlider ?? false,
      sliderHeightM: u(villa?.pool?.sliderHeightM),
      hasKidPool: villa?.pool?.hasKidPool ?? false,
    },
    amenities: (villa?.amenities as string[]) ?? ['wifi'],
    rules: {
      checkInFrom: villa?.rules?.checkInFrom ?? '14:00',
      checkOutBefore: villa?.rules?.checkOutBefore ?? '12:00',
      petAllowed: villa?.rules?.petAllowed ?? false,
      loudMusicAllowed: villa?.rules?.loudMusicAllowed ?? false,
      smokingPolicy:
        (villa?.rules?.smokingPolicy as VillaFormValues['rules']['smokingPolicy']) ??
        'outdoor_only',
      partyPolicy:
        (villa?.rules?.partyPolicy as VillaFormValues['rules']['partyPolicy']) ?? 'on_request',
    },
    parking: {
      inHouse: villa?.parking?.inHouse ?? 2,
      garage: villa?.parking?.garage ?? 0,
    },
  };
}

/**
 * Mongoose reports an absent optional field as null, while the form types use
 * undefined for "not set". Normalising here keeps every default expression in
 * toFormValues readable instead of ending each one in `?? undefined`.
 */
function u<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined;
}
