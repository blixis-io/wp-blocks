import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export type ScrollAreaProps = Omit<ComponentProps<'div'>, 'aria-label' | 'aria-labelledby'> & {
  /** Accessible name of the scrollable region (required: keyboard users reach it with Tab). */
  label: string;
};

/**
 * A plain scrollable region. It is focusable and named so keyboard users can scroll it (axe
 * `scrollable-region-focusable`), which the Radix ScrollArea viewport does not provide.
 */
/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- a scroll container must be keyboard reachable */
export function ScrollArea({ className, label, children, ...props }: ScrollAreaProps) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={cn('ed-focus-ring overflow-auto', className)}
      {...props}
    >
      {children}
    </div>
  );
}
/* eslint-enable jsx-a11y/no-noninteractive-tabindex */
