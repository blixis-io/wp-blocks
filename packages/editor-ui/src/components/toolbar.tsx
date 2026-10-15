import * as ToolbarPrimitive from '@radix-ui/react-toolbar';
import type { ComponentProps, MouseEvent } from 'react';
import { cn } from '../lib/cn';
import { buttonVariants } from './button';
import type { VariantProps } from 'class-variance-authority';

/** Roving-tabindex toolbar (APG): one Tab stop, Arrow keys, Home and End move between items. */
export function Toolbar({ className, ...props }: ComponentProps<typeof ToolbarPrimitive.Root>) {
  return <ToolbarPrimitive.Root className={cn('flex items-center gap-1', className)} {...props} />;
}

type ToolbarButtonProps = ComponentProps<typeof ToolbarPrimitive.Button> & VariantProps<typeof buttonVariants>;

/**
 * Toolbar button. `disabled` uses `aria-disabled` and stays in the roving focus order, so a disabled control can
 * still be reached by keyboard and explain itself through a tooltip (APG recommendation for toolbars).
 */
export function ToolbarButton({
  className,
  variant = 'ghost',
  size,
  disabled = false,
  onClick,
  type = 'button',
  ...props
}: ToolbarButtonProps) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (disabled) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };
  return (
    <ToolbarPrimitive.Button
      type={type}
      aria-disabled={disabled || undefined}
      className={cn(buttonVariants({ variant, size }), className)}
      onClick={handleClick}
      {...props}
    />
  );
}

export function ToolbarLink({
  className,
  variant = 'ghost',
  size,
  ...props
}: ComponentProps<typeof ToolbarPrimitive.Link> & VariantProps<typeof buttonVariants>) {
  return <ToolbarPrimitive.Link className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export function ToolbarSeparator({ className, ...props }: ComponentProps<typeof ToolbarPrimitive.Separator>) {
  return (
    <ToolbarPrimitive.Separator className={cn('mx-1 h-6 w-px shrink-0 bg-ed-border-strong', className)} {...props} />
  );
}

export function ToolbarToggleGroup({ className, ...props }: ComponentProps<typeof ToolbarPrimitive.ToggleGroup>) {
  return <ToolbarPrimitive.ToggleGroup className={cn('flex items-center gap-0.5', className)} {...props} />;
}

export function ToolbarToggleItem({
  className,
  size,
  ...props
}: ComponentProps<typeof ToolbarPrimitive.ToggleItem> & Pick<VariantProps<typeof buttonVariants>, 'size'>) {
  return (
    <ToolbarPrimitive.ToggleItem
      className={cn(
        buttonVariants({ variant: 'ghost', size }),
        'aria-checked:bg-ed-selected aria-checked:text-ed-selected-fg aria-pressed:bg-ed-selected aria-pressed:text-ed-selected-fg',
        className,
      )}
      {...props}
    />
  );
}
