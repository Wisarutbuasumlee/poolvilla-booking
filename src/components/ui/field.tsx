import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Form primitives.
 *
 * The label is always rendered and always tied to its control. A placeholder
 * standing in for a label disappears the moment somebody types, which is
 * exactly when a guest filling in a booking form needs it most.
 */

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return (
    <label
      className={cn('block text-sm font-medium text-[var(--fg-default)]', className)}
      {...props}
    />
  );
}

const controlBase = [
  'w-full rounded-[var(--radius-md)] border bg-[var(--bg-surface)]',
  'border-[var(--border-default)] text-[var(--fg-default)]',
  'placeholder:text-[var(--fg-subtle)]',
  'transition-colors duration-150',
  'hover:border-[var(--border-strong)]',
  'disabled:cursor-not-allowed disabled:opacity-60',
  'aria-[invalid=true]:border-[var(--color-danger)]',
];

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(controlBase, 'h-11 px-3 text-sm', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(controlBase, 'min-h-24 p-3 text-sm', className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(controlBase, 'h-11 px-3 text-sm', className)} {...props} />;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-1 text-[var(--color-danger)]">*</span> : null}
      </Label>
      {children}
      {/* The error replaces the hint rather than stacking below it, so the
          field never grows and pushes the submit button out of reach. */}
      {error ? (
        <p className="text-sm text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-[var(--fg-muted)]">{hint}</p>
      ) : null}
    </div>
  );
}
