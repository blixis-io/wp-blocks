import { useEffect, useState } from 'react';
import { Icon } from '@blixis/wp-editor-ui';
import { readSessionStorage, writeSessionStorage } from '../storage';
import { useI18n } from '../i18n-react';

const KEY = 'blixis-inspector-sections';
function readCollapsed(id: string, defaultCollapsed: boolean): boolean {
  try {
    const raw = readSessionStorage(KEY);
    const value: unknown = raw ? JSON.parse(raw) : {};
    return typeof value === 'object' && value !== null && Object.hasOwn(value, id)
      ? (value as Record<string, unknown>)[id] === true
      : defaultCollapsed;
  } catch {
    return defaultCollapsed;
  }
}

export function InspectorSection({
  id,
  title,
  badge,
  children,
  defaultCollapsed = false,
}: {
  id: string;
  title: string;
  badge?: string;
  children: React.ReactNode;
  defaultCollapsed?: boolean;
}) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(() => readCollapsed(id, defaultCollapsed));
  const [hidden, setHidden] = useState(() => readCollapsed(id, defaultCollapsed));
  // `hidden` is applied after the collapse transition. A timer backs up `transitionend`, which never fires when no
  // transition runs (reduced motion, zero duration, interrupted transition), so a collapsed panel cannot stay laid out.
  useEffect(() => {
    if (!collapsed) return undefined;
    const timer = window.setTimeout(() => {
      setHidden(true);
    }, 260);
    return () => {
      window.clearTimeout(timer);
    };
  }, [collapsed]);
  const headingId = `inspector-section-${id}-heading`;
  const panelId = `inspector-section-${id}-panel`;
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    if (!next) setHidden(false);
    try {
      const raw = readSessionStorage(KEY);
      const stored: unknown = raw ? JSON.parse(raw) : {};
      const entries = typeof stored === 'object' && stored !== null ? (stored as Record<string, unknown>) : {};
      writeSessionStorage(KEY, JSON.stringify({ ...entries, [id]: next }));
    } catch {
      writeSessionStorage(KEY, JSON.stringify({ [id]: next }));
    }
  };
  return (
    <section className="blx-inspector-section">
      <h3 id={headingId} className="blx-inspector-section-heading">
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-controls={panelId}
          aria-label={t('inspector.section.toggle', { section: title })}
          onClick={toggle}
        >
          <Icon name="chevronDown" size={14} />
          <span>{title}</span>
          {badge ? <span className="blx-inspector-section-badge">{badge}</span> : null}
        </button>
      </h3>
      <div
        id={panelId}
        role="region"
        aria-labelledby={headingId}
        aria-hidden={collapsed || undefined}
        inert={collapsed}
        hidden={hidden}
        className="blx-inspector-section-panel"
        onTransitionEnd={(event) => {
          if (event.target === event.currentTarget && collapsed) setHidden(true);
        }}
      >
        <div className="blx-inspector-section-content">{children}</div>
      </div>
    </section>
  );
}
