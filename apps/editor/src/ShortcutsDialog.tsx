import { Dialog, DialogContent, DialogTrigger, Kbd } from '@blixis/wp-editor-ui';
import type { ReactNode } from 'react';
import { useI18n } from './i18n-react';
import type { MessageKey } from './i18n';

interface Shortcut {
  keys: readonly string[];
  label: MessageKey;
}

const AVAILABLE: readonly Shortcut[] = [
  { keys: ['Tab'], label: 'shortcuts.key.tab' },
  { keys: ['←', '→'], label: 'shortcuts.key.arrows' },
  { keys: ['Home', 'End'], label: 'shortcuts.key.homeEnd' },
  { keys: ['Esc'], label: 'shortcuts.key.escape' },
];

const PLANNED: readonly Shortcut[] = [
  { keys: ['Mod', 'Z'], label: 'shortcuts.key.undo' },
  { keys: ['Mod', 'Shift', 'Z'], label: 'shortcuts.key.redo' },
  { keys: ['Mod', 'S'], label: 'shortcuts.key.save' },
  { keys: ['Mod', '/'], label: 'shortcuts.key.shortcuts' },
  { keys: ['Mod', 'Alt', '1'], label: 'shortcuts.key.structure' },
  { keys: ['Mod', 'Alt', '2'], label: 'shortcuts.key.inspector' },
];

function Group({ heading, items }: { heading: string; items: readonly Shortcut[] }) {
  const { t } = useI18n();
  return (
    <section className="blx-shortcuts-group">
      <h3 className="blx-shortcuts-heading">{heading}</h3>
      <dl className="blx-shortcuts">
        {items.map((item) => (
          <ShortcutRow key={item.label} keys={item.keys}>
            {t(item.label)}
          </ShortcutRow>
        ))}
      </dl>
    </section>
  );
}

function ShortcutRow({ keys, children }: { keys: readonly string[]; children: ReactNode }) {
  return (
    <>
      <dt>
        {keys.map((key) => (
          <Kbd key={key}>{key}</Kbd>
        ))}
      </dt>
      <dd>{children}</dd>
    </>
  );
}

/** The dialog body; the trigger is supplied by the toolbar so it takes part in the roving focus order. */
export function ShortcutsDialog({ trigger }: { trigger: ReactNode }) {
  const { t } = useI18n();
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        title={t('shortcuts.title')}
        description={t('shortcuts.description')}
        closeLabel={t('dialog.close')}
      >
        <Group heading={t('shortcuts.now')} items={AVAILABLE} />
        <Group heading={t('shortcuts.planned')} items={PLANNED} />
      </DialogContent>
    </Dialog>
  );
}
