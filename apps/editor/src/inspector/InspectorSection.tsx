import { useState } from 'react';
import { Icon } from '@blixis/wp-editor-ui';
import { readSessionStorage, writeSessionStorage } from '../storage';
import { useI18n } from '../i18n-react';

const KEY = 'blixis-inspector-sections';
function readCollapsed(id: string): boolean {
  try {
    const raw = readSessionStorage(KEY);
    const value: unknown = raw ? JSON.parse(raw) : {};
    return typeof value === 'object' && value !== null && (value as Record<string, unknown>)[id] === true;
  } catch {
    return false;
  }
}

export function InspectorSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(() => readCollapsed(id));
  const headingId = `inspector-section-${id}-heading`;
  const panelId = `inspector-section-${id}-panel`;
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
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
          <Icon name={!collapsed ? 'chevronDown' : 'caretRight'} size={14} />
          <span>{title}</span>
          <Icon name={!collapsed ? 'chevronUp' : 'chevronDown'} size={14} />
        </button>
      </h3>
      <div id={panelId} role="region" aria-labelledby={headingId} hidden={collapsed}>
        {children}
      </div>
    </section>
  );
}
