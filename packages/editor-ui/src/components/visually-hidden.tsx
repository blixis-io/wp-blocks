import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

/** Hides content visually but keeps it available to assistive technology. */
export function VisuallyHidden({ className, ...props }: ComponentProps<'span'>) {
  return <span className={cn('sr-only', className)} {...props} />;
}
