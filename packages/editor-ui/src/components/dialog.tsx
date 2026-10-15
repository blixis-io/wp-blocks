import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/cn';
import { usePortalContainer } from '../lib/portal';
import { Button } from './button';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

export type DialogContentProps = Omit<ComponentProps<typeof DialogPrimitive.Content>, 'title'> & {
  /** Accessible name of the dialog (rendered as its heading). */
  title: ReactNode;
  /** Short description, wired to `aria-describedby`. */
  description: ReactNode;
  /** Translated label of the close button. */
  closeLabel: string;
};

/**
 * Modal dialog: traps focus, closes on Escape, returns focus to the trigger and always has a name and a description.
 */
export function DialogContent({ className, title, description, closeLabel, children, ...props }: DialogContentProps) {
  const container = usePortalContainer();
  return (
    <DialogPrimitive.Portal container={container}>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-ed-overlay" />
      <DialogPrimitive.Content
        className={cn(
          'fixed inset-0 z-50 m-auto flex h-fit max-h-[85vh] w-[min(90vw,32rem)] flex-col gap-4 overflow-auto rounded-lg border border-ed-border-strong bg-ed-bg p-6 text-ed-fg',
          className,
        )}
        {...props}
      >
        <div className="flex flex-col gap-1.5">
          <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="text-sm text-ed-fg-muted">{description}</DialogPrimitive.Description>
        </div>
        {children}
        <DialogPrimitive.Close asChild>
          <Button variant="ghost" size="icon" className="absolute end-3 top-3" aria-label={closeLabel}>
            <X aria-hidden="true" className="size-4" />
          </Button>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
