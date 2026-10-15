import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export function Tabs({ className, ...props }: ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root className={cn('flex min-h-0 flex-col', className)} {...props} />;
}

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn('flex shrink-0 items-center gap-1 border-b border-ed-border p-1', className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'ed-focus-ring inline-flex h-[var(--ed-control-height)] flex-1 items-center justify-center rounded-md px-3 text-sm font-medium text-ed-fg-muted hover:bg-ed-surface-hover hover:text-ed-fg aria-selected:bg-transparent aria-selected:text-ed-primary disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('ed-focus-ring min-h-0 flex-1 p-3', className)} {...props} />;
}
