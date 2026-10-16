import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ComponentProps } from 'react';
import { cn } from '../lib/cn';
import { usePortalContainer } from '../lib/portal';

/** Tooltips open after a short delay on hover and immediately on keyboard focus; Escape closes them. */
export function TooltipProvider({
  delayDuration = 450,
  skipDelayDuration = 300,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider delayDuration={delayDuration} skipDelayDuration={skipDelayDuration} {...props} />;
}

const dismissContext = createContext<(immediate?: boolean) => void>(() => undefined);

export function Tooltip({ open, defaultOpen, onOpenChange, ...props }: ComponentProps<typeof TooltipPrimitive.Root>) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen ?? false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const controlled = open !== undefined;
  const currentOpen = controlled ? open : internalOpen;
  const setOpen = useCallback(
    (next: boolean, immediate = false) => {
      if (timer.current !== undefined) clearTimeout(timer.current);
      const apply = () => {
        if (!controlled) setInternalOpen(next);
        onOpenChange?.(next);
      };
      if (next || immediate) apply();
      else timer.current = setTimeout(apply, 80);
    },
    [controlled, onOpenChange],
  );
  useEffect(() => {
    if (!currentOpen) return;
    const closeOnScroll = () => {
      setOpen(false, true);
    };
    window.addEventListener('scroll', closeOnScroll, true);
    return () => {
      window.removeEventListener('scroll', closeOnScroll, true);
    };
  }, [currentOpen, setOpen]);
  useEffect(
    () => () => {
      if (timer.current !== undefined) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <dismissContext.Provider
      value={(immediate = true) => {
        setOpen(false, immediate);
      }}
    >
      <TooltipPrimitive.Root
        {...props}
        {...(controlled ? { open } : { open: internalOpen })}
        onOpenChange={(next) => {
          setOpen(next);
        }}
      />
    </dismissContext.Provider>
  );
}

export function TooltipTrigger(props: ComponentProps<typeof TooltipPrimitive.Trigger>) {
  const dismiss = useContext(dismissContext);
  return (
    <TooltipPrimitive.Trigger
      {...props}
      onPointerDown={(event) => {
        props.onPointerDown?.(event);
        dismiss();
      }}
      onPointerLeave={(event) => {
        props.onPointerLeave?.(event);
        if (!event.currentTarget.matches(':focus-visible')) dismiss(false);
      }}
    />
  );
}

export function TooltipContent({
  className,
  sideOffset = 8,
  collisionPadding = 8,
  children,
  description,
  shortcut,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Content> & { description?: string; shortcut?: readonly string[] }) {
  const container = usePortalContainer();
  const dismiss = useContext(dismissContext);
  return (
    <TooltipPrimitive.Portal container={container}>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn('ed-tooltip z-floating', className)}
        {...props}
        onKeyDown={(event) => {
          props.onKeyDown?.(event);
          if (event.key === 'Escape') dismiss();
        }}
        onEscapeKeyDown={(event) => {
          props.onEscapeKeyDown?.(event);
          dismiss();
        }}
      >
        <span className="ed-tooltip-title">{children}</span>
        {description ? <span className="ed-tooltip-description">{description}</span> : null}
        {shortcut?.length ? (
          <span className="ed-tooltip-keys" aria-label={shortcut.join(' + ')}>
            {shortcut.map((key, index) => (
              <kbd key={`${key}-${String(index)}`}>{key}</kbd>
            ))}
          </span>
        ) : null}
        <span className="ed-tooltip-arrow" aria-hidden="true" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}
