import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';
import { usePortalContainer } from '../lib/portal';

/** Tooltips open after a short delay on hover and immediately on keyboard focus; Escape closes them. */
export function TooltipProvider({
  delayDuration = 400,
  skipDelayDuration = 300,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider delayDuration={delayDuration} skipDelayDuration={skipDelayDuration} {...props} />;
}

export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Content>) {
  const container = usePortalContainer();
  return (
    <TooltipPrimitive.Portal container={container}>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 max-w-72 rounded-md border border-ed-border-strong bg-ed-tooltip px-2.5 py-1.5 text-xs text-ed-tooltip-fg',
          className,
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}
