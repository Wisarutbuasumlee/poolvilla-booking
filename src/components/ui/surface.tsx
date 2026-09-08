import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Containers and status surfaces.
 *
 * Two elevation levels exist and no more. A third is nearly always a layout
 * problem wearing a shadow.
 */

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-lg)] border border-[var(--border-default)]',
        'bg-[var(--bg-surface)] shadow-[var(--shadow-card)]',
        className,
      )}
      {...props}
    />
  );
}

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: ComponentProps<'span'> & { tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent' }) {
  const tones = {
    neutral: 'bg-[var(--bg-sunken)] text-[var(--fg-muted)]',
    success: 'bg-[var(--color-success)]/12 text-[var(--color-success)]',
    warning: 'bg-[var(--color-warning)]/14 text-[var(--color-warning)]',
    danger: 'bg-[var(--color-danger)]/12 text-[var(--color-danger)]',
    accent: 'bg-[var(--accent-subtle)] text-[var(--accent)]',
  } as const;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

/**
 * A designed empty state, not a shrug.
 *
 * Every list in this product can legitimately be empty: a new villa has no
 * bookings, a quiet week has no arrivals. Those are normal states and they get
 * the same care as a full one, including a way out.
 */
export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      {icon ? <div className="text-[var(--fg-subtle)]">{icon}</div> : null}
      <p className="text-base font-medium text-[var(--fg-default)]">{title}</p>
      {body ? <p className="max-w-sm text-sm text-[var(--fg-muted)]">{body}</p> : null}
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}

/** Loading is a skeleton of the thing that is coming, never a spinner. */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('animate-pulse rounded-[var(--radius-md)] bg-[var(--bg-sunken)]', className)}
      {...props}
    />
  );
}

/** Prices, counts and dates. Misaligned figures read as a calculation error. */
export function Money({
  satang,
  className,
  suffix,
}: {
  satang: number;
  className?: string;
  suffix?: string;
}) {
  return (
    <span className={cn('tnum', className)}>
      ฿{(satang / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}
      {suffix ? <span className="text-[var(--fg-muted)]"> {suffix}</span> : null}
    </span>
  );
}
