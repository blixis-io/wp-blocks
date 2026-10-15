import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'inline-flex min-w-6 items-center justify-center rounded-sm border border-ed-border-strong bg-ed-surface-2 px-1.5 py-0.5 font-mono text-xs text-ed-fg',
        className,
      )}
      {...props}
    />
  );
}
