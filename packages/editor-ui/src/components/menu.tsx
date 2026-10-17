import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { usePortalContainer } from '../lib/portal';
import { cn } from '../lib/cn';
import { ToolbarButton } from './toolbar';
import { Icon } from './icon';

export interface MenuItem {
  label: string;
  onSelect?: () => void;
  href?: string | undefined;
  disabled?: boolean;
  checked?: boolean;
  role?: 'menuitem' | 'menuitemcheckbox' | 'menuitemradio';
  describedBy?: string | undefined;
  icon?: ReactNode;
}

/** Accessible menu button with managed focus, typeahead and a portal scoped to the editor root. */
export function Menu({
  label,
  items = [],
  className,
  triggerClassName,
  children,
  toolbarTrigger = false,
}: {
  label: string;
  items?: readonly MenuItem[];
  className?: string;
  triggerClassName?: string;
  children?: ReactNode;
  /** Use the editor toolbar's roving-tabindex button when this menu is in a Toolbar. */
  toolbarTrigger?: boolean;
}) {
  const portal = usePortalContainer();
  const portalTarget = portal ?? document.body;
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const entries = useRef<(HTMLButtonElement | HTMLAnchorElement | null)[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const menuElement = useRef<HTMLDivElement>(null);
  const typeahead = useRef('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const enabled = items.map((item, index) => (item.disabled ? -1 : index)).filter((index) => index >= 0);
  const focus = (index: number) => {
    const next = enabled.find((entry) => entry === index) ?? enabled[0];
    if (next !== undefined) {
      activeRef.current = next;
      setActive(next);
      entries.current[next]?.focus();
    }
  };
  const stepFocus = (current: number, delta: number) => {
    if (enabled.length === 0) return;
    const position = enabled.indexOf(current);
    const target = enabled[(position + delta + enabled.length) % enabled.length] ?? enabled[0];
    if (target !== undefined) focus(target);
  };
  const close = (restore = true) => {
    setOpen(false);
    if (restore) trigger.current?.focus();
  };
  useLayoutEffect(() => {
    if (open) entries.current[activeRef.current]?.focus();
  }, [open]);
  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const width = menuElement.current?.offsetWidth ?? 192;
    const rtl = getComputedStyle(trigger.current).direction === 'rtl';
    const physicalLeft = Math.max(4, Math.min(window.innerWidth - width - 4, rtl ? rect.right - width : rect.left));
    setPosition({ top: rect.bottom + 4, left: rtl ? window.innerWidth - width - physicalLeft : physicalLeft });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node) && !menuElement.current?.contains(event.target as Node))
        setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('pointerdown', outside);
    };
  }, [open, portalTarget]);
  useEffect(() => {
    return () => {
      clearTimeout(timer.current);
    };
  }, []);
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const rtl = getComputedStyle(trigger.current ?? document.documentElement).direction === 'rtl';
      const forward = (event.key === 'ArrowRight') !== rtl;
      const targetIndex = Number(event.currentTarget.dataset['menuIndex']);
      event.preventDefault();
      stepFocus(Number.isInteger(targetIndex) ? targetIndex : activeRef.current, forward ? 1 : -1);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const targetIndex = Number(event.currentTarget.dataset['menuIndex']);
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      stepFocus(Number.isInteger(targetIndex) ? targetIndex : activeRef.current, delta);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      focus(event.key === 'Home' ? (enabled[0] ?? -1) : (enabled[enabled.length - 1] ?? -1));
    } else if (event.key.length === 1 && /[\p{L}\p{N}]/u.test(event.key)) {
      const char = event.key.toLocaleLowerCase();
      const repeated = typeahead.current.length === 1 && typeahead.current === char;
      typeahead.current = repeated ? char : typeahead.current + char;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        typeahead.current = '';
      }, 500);
      const start = enabled.indexOf(activeRef.current);
      const rotated = repeated
        ? [...enabled.slice(start + 1), ...enabled.slice(0, start + 1)]
        : [...enabled.slice(start), ...enabled.slice(0, start)];
      const found = rotated.find((index) => items[index]?.label.toLocaleLowerCase().startsWith(typeahead.current));
      if (found !== undefined) {
        event.preventDefault();
        focus(found);
      }
    }
  };
  const menu = open
    ? createPortal(
        <div
          ref={menuElement}
          role="menu"
          aria-label={label}
          className="ed-menu"
          dir="inherit"
          style={{ insetBlockStart: position.top, insetInlineStart: position.left }}
        >
          {items.map((item, index) => {
            const role: NonNullable<MenuItem['role']> =
              item.role ?? (item.checked === undefined ? 'menuitem' : 'menuitemcheckbox');
            const common = {
              role,
              'data-menu-index': index,
              tabIndex: active === index ? 0 : -1,
              'aria-disabled': item.disabled ?? undefined,
              'aria-checked': item.checked ?? undefined,
              'aria-describedby': item.describedBy,
              ref: (node: HTMLButtonElement | HTMLAnchorElement | null) => {
                entries.current[index] = node;
              },
              onFocus: () => {
                activeRef.current = index;
                setActive(index);
              },
              onKeyDown: (event: KeyboardEvent<HTMLButtonElement | HTMLAnchorElement>) => {
                event.stopPropagation();
                onKeyDown(event);
              },
              onClick: () => {
                if (item.disabled) return;
                item.onSelect?.();
                if (!item.href) close();
              },
              className: cn('ed-menu-item', item.disabled && 'is-disabled'),
            };
            return item.href ? (
              <a key={`${item.label}-${String(index)}`} {...common} href={item.href}>
                <span className="ed-menu-item-content">
                  {item.icon}
                  {item.label}
                </span>
                {item.checked ? <Icon name="check" size={14} /> : null}
              </a>
            ) : (
              <button key={`${item.label}-${String(index)}`} type="button" {...common} disabled={item.disabled}>
                <span className="ed-menu-item-content">
                  {item.icon}
                  {item.label}
                </span>
                {item.checked ? <Icon name="check" size={14} /> : null}
              </button>
            );
          })}
        </div>,
        portalTarget,
      )
    : null;
  const toggle = () => {
    if (!open) {
      activeRef.current = enabled[0] ?? 0;
      setActive(activeRef.current);
      setOpen(true);
    } else close(false);
  };
  const triggerKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        activeRef.current = enabled[0] ?? 0;
        setActive(activeRef.current);
      }
    }
  };
  const triggerProps = {
    ref: trigger,
    type: 'button' as const,
    className: cn('ed-menu-trigger', triggerClassName),
    'aria-label': label,
    'aria-haspopup': 'menu' as const,
    'aria-expanded': open,
    onClick: toggle,
    onKeyDown: triggerKeyDown,
  };
  return (
    <div ref={root} className={cn('ed-menu-root', className)}>
      {toolbarTrigger ? (
        <ToolbarButton {...triggerProps}>{children}</ToolbarButton>
      ) : (
        <button {...triggerProps}>{children}</button>
      )}
      {menu}
    </div>
  );
}
