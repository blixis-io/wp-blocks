import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export const buttonVariants = cva(
  'ed-focus-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap select-none disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-ed-primary text-ed-primary-fg hover:bg-ed-primary-hover',
        secondary: 'bg-ed-surface-2 text-ed-fg hover:bg-ed-surface-hover',
        ghost: 'bg-transparent text-ed-fg hover:bg-ed-surface-hover',
        outline: 'border border-ed-border-strong bg-transparent text-ed-fg hover:bg-ed-surface-hover',
        destructive: 'bg-ed-destructive text-ed-destructive-fg hover:bg-ed-destructive-hover',
      },
      size: {
        default: 'h-8 min-w-8 px-3',
        icon: 'size-8',
        /** 44 px targets for touch-first use (WCAG 2.5.5 enhanced target size). */
        touch: 'h-11 min-w-11 px-4',
        'icon-touch': 'size-11',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export type ButtonProps = ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild = false, type = 'button', ...props }: ButtonProps) {
  if (asChild) return <Slot className={cn(buttonVariants({ variant, size }), className)} {...props} />;
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
