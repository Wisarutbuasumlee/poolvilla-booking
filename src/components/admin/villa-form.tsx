'use client';

import { AlertCircle, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { AMENITIES } from '@/lib/villas/constants';
import { saveVillaAction, type ActionResult } from '@/lib/villas/actions';
import { Button } from '@/components/ui/button';
import { Field, Input, Label, Select, Textarea } from '@/components/ui/field';
import { Card } from '@/components/ui/surface';
import { cn } from '@/lib/utils';

/**
 * The villa editor.
 *
 * All fields live in ONE form and every tab stays mounted; the tabs only
 * control visibility. A wizard that unmounts a panel loses whatever was typed
 * there, and this form is long enough that somebody will always tab back to
 * check a number before saving.
 *
 * Prices are entered in baht and converted to satang by the schema. Nobody
 * types satang, and asking them to is how a rate ends up a hundred times wrong.
 */

const TABS = ['general', 'location', 'capacity', 'pricing', 'pool', 'rules'] as const;
type Tab = (typeof TABS)[number];

export interface VillaFormValues {
  code: string;
  slug: string;
  status: 'draft' | 'published' | 'hidden';
  name: { th: string; en?: string; zh?: string };
  description?: { th?: string; en?: string; zh?: string };
  location: {
    province: string;
    district?: string;
    zone: string;
    landmark?: string;
    distanceToBeachKm?: number;
    googleMapUrl?: string;
  };
  capacity: {
    bedrooms: number;
    bathrooms: number;
    baseGuests: number;
    maxExtraGuests: number;
    extraGuestFee: number;
    freeChildUnder10Quota: number;
  };
  basePricing: { sunThu: number; fri: number; sat: number; holiday: number };
  minNights: number;
  damageDeposit: number;
  pool: {
    isPrivate: boolean;
    system: 'chlorine' | 'saltwater';
    widthM?: number;
    lengthM?: number;
    depthM?: number;
    hasSlider: boolean;
    sliderHeightM?: number;
    hasKidPool: boolean;
  };
  amenities: string[];
  rules: {
    checkInFrom: string;
    checkOutBefore: string;
    petAllowed: boolean;
    loudMusicAllowed: boolean;
    smokingPolicy: 'not_allowed' | 'outdoor_only' | 'allowed';
    partyPolicy: 'not_allowed' | 'allowed' | 'on_request';
  };
  parking: { inHouse: number; garage: number };
}

/** Satang in the database, baht in the input. */
const toBaht = (satang: number) => String(satang / 100);

export function VillaForm({
  villaId,
  values,
  justSaved,
}: {
  villaId: string | null;
  values: VillaFormValues;
  justSaved?: boolean;
}) {
  const t = useTranslations('admin.villas');
  const f = useTranslations('admin.villas.fields');
  const [tab, setTab] = useState<Tab>('general');
  const [amenities, setAmenities] = useState<string[]>(values.amenities);

  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    (_previous, formData) => saveVillaAction(villaId, formData),
    null,
  );

  const errors = state?.errors ?? {};
  const error = (path: string) => errors[path];

  /** Jump to the first tab that has an error, so nothing fails invisibly. */
  const errorTab = findErrorTab(errors);
  if (errorTab && errorTab !== tab && state && !state.ok) setTab(errorTab);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="amenitiesJson" value={JSON.stringify(amenities)} />
      <input
        type="hidden"
        name="kitchenJson"
        value={JSON.stringify({ available: [], unavailable: [] })}
      />

      {justSaved && !state ? (
        <p className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-success)]/10 p-3 text-sm text-[var(--color-success)]">
          <Check className="h-4 w-4" aria-hidden />
          {t('saved')}
        </p>
      ) : null}

      {state && !state.ok ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {state.message ?? t('fixErrors')}
        </p>
      ) : null}

      <div className="flex gap-1 overflow-x-auto border-b border-[var(--border-default)]">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setTab(name)}
            aria-current={tab === name ? 'true' : undefined}
            className={cn(
              'shrink-0 border-b-2 px-3 py-2 text-sm transition-colors',
              tab === name
                ? 'border-[var(--accent)] font-medium text-[var(--accent)]'
                : 'border-transparent text-[var(--fg-muted)] hover:text-[var(--fg-default)]',
            )}
          >
            {t(`tabs.${name}`)}
          </button>
        ))}
      </div>

      {/* hidden, not unmounted: every field is still submitted. */}
      <Card className="p-5" hidden={tab !== 'general'}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={f('code')} htmlFor="code" required error={error('code')}>
            <Input id="code" name="code" defaultValue={values.code} placeholder="DV-2685" required />
          </Field>
          <Field label={f('slug')} htmlFor="slug" required error={error('slug')}>
            <Input id="slug" name="slug" defaultValue={values.slug} required />
          </Field>
          <Field label={f('status')} htmlFor="status">
            <Select id="status" name="status" defaultValue={values.status}>
              <option value="draft">{t('status.draft')}</option>
              <option value="published">{t('status.published')}</option>
              <option value="hidden">{t('status.hidden')}</option>
            </Select>
          </Field>
          <div />
          <Field label={f('nameTh')} htmlFor="name.th" required error={error('name.th')}>
            <Input id="name.th" name="name.th" defaultValue={values.name.th} required />
          </Field>
          <Field label={f('nameEn')} htmlFor="name.en">
            <Input id="name.en" name="name.en" defaultValue={values.name.en ?? ''} />
          </Field>
          <Field label={f('nameZh')} htmlFor="name.zh">
            <Input id="name.zh" name="name.zh" defaultValue={values.name.zh ?? ''} />
          </Field>
          <div />
          <div className="sm:col-span-2">
            <Field label={f('descriptionTh')} htmlFor="description.th">
              <Textarea
                id="description.th"
                name="description.th"
                defaultValue={values.description?.th ?? ''}
                rows={4}
              />
            </Field>
          </div>
        </div>
      </Card>

      <Card className="p-5" hidden={tab !== 'location'}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={f('province')}
            htmlFor="location.province"
            required
            error={error('location.province')}
          >
            <Input
              id="location.province"
              name="location.province"
              defaultValue={values.location.province}
              required
            />
          </Field>
          <Field label={f('zone')} htmlFor="location.zone" required error={error('location.zone')}>
            <Input
              id="location.zone"
              name="location.zone"
              defaultValue={values.location.zone}
              required
            />
          </Field>
          <Field label={f('district')} htmlFor="location.district">
            <Input
              id="location.district"
              name="location.district"
              defaultValue={values.location.district ?? ''}
            />
          </Field>
          <Field label={f('landmark')} htmlFor="location.landmark">
            <Input
              id="location.landmark"
              name="location.landmark"
              defaultValue={values.location.landmark ?? ''}
            />
          </Field>
          <Field label={f('distanceToBeachKm')} htmlFor="location.distanceToBeachKm">
            <Input
              id="location.distanceToBeachKm"
              name="location.distanceToBeachKm"
              type="number"
              step="0.1"
              min="0"
              defaultValue={values.location.distanceToBeachKm ?? ''}
            />
          </Field>
          <Field label={f('googleMapUrl')} htmlFor="location.googleMapUrl">
            <Input
              id="location.googleMapUrl"
              name="location.googleMapUrl"
              type="url"
              defaultValue={values.location.googleMapUrl ?? ''}
            />
          </Field>
        </div>
      </Card>

      <Card className="p-5" hidden={tab !== 'capacity'}>
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField name="capacity.bedrooms" label={f('bedrooms')} value={values.capacity.bedrooms} error={error('capacity.bedrooms')} />
          <NumberField name="capacity.bathrooms" label={f('bathrooms')} value={values.capacity.bathrooms} />
          <NumberField name="capacity.baseGuests" label={f('baseGuests')} value={values.capacity.baseGuests} error={error('capacity.baseGuests')} />
          <NumberField name="capacity.maxExtraGuests" label={f('maxExtraGuests')} value={values.capacity.maxExtraGuests} />
          <NumberField name="capacity.extraGuestFee" label={f('extraGuestFee')} value={values.capacity.extraGuestFee} baht />
          <NumberField
            name="capacity.freeChildUnder10Quota"
            label={f('freeChildUnder10Quota')}
            value={values.capacity.freeChildUnder10Quota}
          />
          <NumberField name="parking.inHouse" label={f('parkingInHouse')} value={values.parking.inHouse} />
          <NumberField name="parking.garage" label={f('parkingGarage')} value={values.parking.garage} />
        </div>
      </Card>

      <Card className="p-5" hidden={tab !== 'pricing'}>
        <p className="mb-4 rounded-[var(--radius-md)] bg-[var(--accent-subtle)] p-3 text-sm text-[var(--fg-default)]">
          {t('pricingNote')}
        </p>
        <div className="grid gap-4 sm:grid-cols-4">
          <NumberField name="basePricing.sunThu" label={f('sunThu')} value={values.basePricing.sunThu} baht />
          <NumberField name="basePricing.fri" label={f('fri')} value={values.basePricing.fri} baht />
          <NumberField name="basePricing.sat" label={f('sat')} value={values.basePricing.sat} baht />
          <NumberField name="basePricing.holiday" label={f('holiday')} value={values.basePricing.holiday} baht />
          <NumberField name="minNights" label={f('minNights')} value={values.minNights} />
          <NumberField name="damageDeposit" label={f('damageDeposit')} value={values.damageDeposit} baht />
        </div>
      </Card>

      <Card className="p-5" hidden={tab !== 'pool'}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={f('poolSystem')} htmlFor="pool.system">
            <Select id="pool.system" name="pool.system" defaultValue={values.pool.system}>
              <option value="chlorine">คลอรีน</option>
              <option value="saltwater">น้ำเกลือ</option>
            </Select>
          </Field>
          <NumberField name="pool.widthM" label={f('poolWidth')} value={values.pool.widthM} decimal />
          <NumberField name="pool.lengthM" label={f('poolLength')} value={values.pool.lengthM} decimal />
          <NumberField name="pool.depthM" label={f('poolDepth')} value={values.pool.depthM} decimal />
          <NumberField
            name="pool.sliderHeightM"
            label={f('sliderHeight')}
            value={values.pool.sliderHeightM}
            decimal
            error={error('pool.sliderHeightM')}
          />
          <div className="space-y-2 pt-6">
            <Checkbox name="pool.isPrivate" label="สระส่วนตัว" checked={values.pool.isPrivate} />
            <Checkbox name="pool.hasSlider" label={f('hasSlider')} checked={values.pool.hasSlider} />
            <Checkbox name="pool.hasKidPool" label={f('hasKidPool')} checked={values.pool.hasKidPool} />
          </div>
        </div>

        <fieldset className="mt-6">
          <legend className="mb-2 text-sm font-medium">{f('amenities')}</legend>
          <div className="flex flex-wrap gap-2">
            {AMENITIES.map((amenity) => {
              const on = amenities.includes(amenity);
              return (
                <button
                  key={amenity}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setAmenities((current) =>
                      on ? current.filter((entry) => entry !== amenity) : [...current, amenity],
                    )
                  }
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-sm transition-colors',
                    on
                      ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]'
                      : 'border-[var(--border-default)] text-[var(--fg-muted)] hover:border-[var(--border-strong)]',
                  )}
                >
                  {amenity}
                </button>
              );
            })}
          </div>
        </fieldset>
      </Card>

      <Card className="p-5" hidden={tab !== 'rules'}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={f('checkInFrom')} htmlFor="rules.checkInFrom">
            <Input
              id="rules.checkInFrom"
              name="rules.checkInFrom"
              type="time"
              defaultValue={values.rules.checkInFrom}
            />
          </Field>
          <Field label={f('checkOutBefore')} htmlFor="rules.checkOutBefore">
            <Input
              id="rules.checkOutBefore"
              name="rules.checkOutBefore"
              type="time"
              defaultValue={values.rules.checkOutBefore}
            />
          </Field>
          <Field label={f('smokingPolicy')} htmlFor="rules.smokingPolicy">
            <Select
              id="rules.smokingPolicy"
              name="rules.smokingPolicy"
              defaultValue={values.rules.smokingPolicy}
            >
              <option value="not_allowed">ห้ามสูบ</option>
              <option value="outdoor_only">สูบนอกตัวบ้านได้</option>
              <option value="allowed">สูบได้</option>
            </Select>
          </Field>
          <Field label={f('partyPolicy')} htmlFor="rules.partyPolicy">
            <Select
              id="rules.partyPolicy"
              name="rules.partyPolicy"
              defaultValue={values.rules.partyPolicy}
            >
              <option value="not_allowed">ห้ามจัดปาร์ตี้</option>
              <option value="on_request">แจ้งล่วงหน้า</option>
              <option value="allowed">จัดได้</option>
            </Select>
          </Field>
          <div className="space-y-2 sm:col-span-2">
            <Checkbox name="rules.petAllowed" label={f('petAllowed')} checked={values.rules.petAllowed} />
            <Checkbox
              name="rules.loudMusicAllowed"
              label={f('loudMusicAllowed')}
              checked={values.rules.loudMusicAllowed}
            />
          </div>
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? t('saving') : t('save')}
        </Button>
      </div>
    </form>
  );
}

function NumberField({
  name,
  label,
  value,
  baht,
  decimal,
  error,
}: {
  name: string;
  label: string;
  value: number | undefined;
  baht?: boolean;
  decimal?: boolean;
  error?: string;
}) {
  return (
    <Field label={label} htmlFor={name} error={error}>
      <Input
        id={name}
        name={name}
        type="number"
        min="0"
        step={decimal ? '0.1' : '1'}
        className="tnum"
        defaultValue={value === undefined ? '' : baht ? toBaht(value) : String(value)}
      />
    </Field>
  );
}

/**
 * A checkbox that always posts a value.
 *
 * An unchecked HTML checkbox sends nothing at all, so a field turned OFF would
 * simply be absent from the payload and keep its old value. The hidden input
 * ahead of it guarantees a 'false' is posted, and the checkbox overwrites it
 * with 'true' when checked.
 */
function Checkbox({
  name,
  label,
  checked,
}: {
  name: string;
  label: string;
  checked: boolean;
}) {
  return (
    <>
      <input type="hidden" name={name} value="" />
      <Label className="flex cursor-pointer items-center gap-2 font-normal">
        <input
          type="checkbox"
          name={name}
          value="true"
          defaultChecked={checked}
          className="h-4 w-4 accent-[var(--accent)]"
        />
        {label}
      </Label>
    </>
  );
}

function findErrorTab(errors: Record<string, string>): Tab | null {
  const first = Object.keys(errors)[0];
  if (!first) return null;
  if (first.startsWith('location')) return 'location';
  if (first.startsWith('capacity') || first.startsWith('parking')) return 'capacity';
  if (first.startsWith('basePricing') || first === 'minNights' || first === 'damageDeposit')
    return 'pricing';
  if (first.startsWith('pool') || first.startsWith('amenities')) return 'pool';
  if (first.startsWith('rules')) return 'rules';
  return 'general';
}
