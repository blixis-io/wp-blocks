import { ScrollArea } from '@blixis/wp-editor-ui';
import type { ElementNode } from '@blixis/wp-core';
import { memo } from 'react';
import { elementLabel } from './element-label';
import { useI18n } from './i18n-react';
import { useEditorStore, useEditorStoreApi } from './state';

const OutlineItem = memo(function OutlineItem({ node }: { node: ElementNode }) {
  const store = useEditorStoreApi();
  const selected = useEditorStore((state) => state.selectedId === node.id);
  return (
    <li>
      <button
        type="button"
        className="blx-outline-item ed-focus-ring"
        aria-current={selected ? 'true' : undefined}
        onClick={() => {
          store.getState().select(node.id);
        }}
      >
        <span>{elementLabel(node.type)}</span> <span className="blx-outline-id">{node.id}</span>
      </button>
      {node.children.length > 0 ? <OutlineList nodes={node.children} /> : null}
    </li>
  );
});

function OutlineList({ nodes, label }: { nodes: readonly ElementNode[]; label?: string }) {
  return (
    <ul aria-label={label} className={label === undefined ? undefined : 'blx-outline'}>
      {nodes.map((node) => (
        <OutlineItem key={node.id} node={node} />
      ))}
    </ul>
  );
}

/**
 * Minimal read-only outline of the loaded document (BWB-050). The real tree with drag and drop is BWB-052/059. Shows
 * loading, error and empty states.
 */
export function StructurePanel() {
  const { t } = useI18n();
  const status = useEditorStore((state) => state.status);
  const error = useEditorStore((state) => state.error);
  const root = useEditorStore((state) => state.document?.root ?? null);

  let body;
  if (status === 'error' && error !== null) {
    body = <p className="blx-empty">{t('panel.structure.loadFailed')}</p>;
  } else if (root !== null && root.length > 0) {
    body = <OutlineList nodes={root} label={t('panel.structure.list')} />;
  } else if (root !== null) {
    body = <p className="blx-empty">{t('panel.structure.emptyDocument')}</p>;
  } else if (status === 'loading') {
    body = (
      <p aria-live="polite" className="blx-empty">
        {t('panel.structure.loading')}
      </p>
    );
  } else {
    body = <p className="blx-empty">{t('panel.structure.empty')}</p>;
  }
  return (
    <ScrollArea label={t('panel.structure')} className="min-h-0 flex-1">
      {body}
    </ScrollArea>
  );
}
