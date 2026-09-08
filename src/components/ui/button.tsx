import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * The only button in the product.
 *
 * Every colour comes from a token, so both themes are covered by construction
 * rather than by remembering. The teal accent is reserved for the primary
 * action on a screen; a page with two primary buttons has not decided what it
 * wants the visitor to do.
 */
const button = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium',
    'transition-colors duration-150',
    'disabled:pointer-events-none disabled:opacity-50',
    // Tap targets on mobile: 44px is the floor, and this is the booking path.
    'min-h-11',
  ],
  {
    variants: {
      variant: {
        primary:
          'bg-[var(--accent)] text-[var(--fg-onBrand)] hover:bg-[var(--accent-hover)] shadow-[var(--shadow-card)]',
        secondary:
          'bg-[var(--bg-surface)] text-[var(--fg-default)] border border-[var(--border-default)] hover:border-[var(--border-strong)]',
        ghost: 'text-[var(--fg-default)] hover:bg-[var(--bg-sunken)]',
        danger: 'bg-[var(--color-danger)] text-white hover:opacity-90',
        // LINE's own green, never re-tinted. Reserved for the LINE action.
        line: 'bg-[var(--color-line)] text-[var(--color-line-ink)] hover:opacity-90',
      },
      size: {
        sm: 'h-9 min-h-9 px-3 text-sm rounded-[var(--radius-sm)]',
        md: 'h-11 px-4 text-sm rounded-[var(--radius-md)]',
        lg: 'h-12 px-6 text-base rounded-[var(--radius-lg)]',
        icon: 'h-10 w-10 min-h-10 rounded-[var(--radius-md)]',
      },
      block: { true: 'w-full' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export type ButtonProps = ComponentProps<'button'> & VariantProps<typeof button>;

export function Button({ className, variant, size, block, ...props }: ButtonProps) {
  return <button className={cn(button({ variant, size, block }), className)} {...props} />;
}

export { button as buttonStyles };
