'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { setMarkupAction } from '@/lib/agents/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Money } from '@/components/ui/surface';

/**
 * Sets what one agent adds on top of the company rate for one villa.
 *
 * The company's base rate is shown beside every field, and the selling price
 * updates as the agent types. Asking somebody to enter a markup while showing
 * them only the markup is asking them to do arithmetic in their head about
 * money, which is exactly where mistakes cost the most.
 */

const DAY_TYPES = ['sunThu', 'fri', 'sat', 'holiday'] as const;
type DayType = (typeof DAY_TYPES)[number];

export function MarkupEditor({
  villaId,
  agentId,
  base,
  markup,
  readOnly,
}: {
  villaId: string;
  agentId: string;
  base: Record<DayType, number>;
  markup: Record<DayType, number>;
  readOnly?: boolean;
}) {
  const t = useTranslations('admin.agents');
  const f = useTranslations('admin.villas.fields');

  const [values, setValues] = useState<Record<DayType, string>>({
    sunThu: String(markup.sunThu / 100),
    fri: String(markup.fri / 100),
    sat: String(markup.sat / 100),
    holiday: String(markup.holiday / 100),
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await setMarkupAction(villaId, agentId, formData);
      if (result.ok) {
        setSaved(true);
        setError(null);
      } else {
        setError('message' in result ? result.message : t('saveFailed'));
      }
    });
  }

  return (
    <form action={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {DAY_TYPES.map((day) => {
          const markupBaht = Number(values[day]) || 0;
          return (
            <label key={day} className="block">
              <span className="block text-xs text-[var(--fg-muted)]">{f(day)}</span>

              <Input
                name={day}
                type="number"
                min={0}
                step={100}
                className="tnum mt-1 h-10"
                value={values[day]}
                disabled={readOnly || pending}
                onChange={(event) => {
                  setValues((current) => ({ ...current, [day]: event.target.value }));
                  setSaved(false);
                }}
              />

              {/* Base and selling price, always visible. The agent is setting
                  the middle number of three and needs the other two. */}
              <span className="mt-1 block text-xs text-[var(--fg-subtle)]">
                <Money satang={base[day]} /> +{' '}
                <span className="tnum">{markupBaht.toLocaleString('en-US')}</span> ={' '}
                <span className="font-medium text-[var(--fg-default)]">
                  <Money satang={base[day] + markupBaht * 100} />
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {readOnly ? null : (
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" variant="secondary" disabled={pending}>
            {pending ? t('saving') : t('saveMarkup')}
          </Button>

          {saved ? (
            <span className="flex items-center gap-1 text-sm text-[var(--color-success)]">
              <Check className="h-4 w-4" aria-hidden />
              {t('saved')}
            </span>
          ) : null}

          {error ? <span className="text-sm text-[var(--color-danger)]">{error}</span> : null}
        </div>
      )}
    </form>
  );
}
