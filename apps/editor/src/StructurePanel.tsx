import { ScrollArea } from '@blixis/wp-editor-ui';
import type { ElementNode } from '@blixis/wp-core';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { findPath, nodeAt } from '@blixis/wp-core';
import { elementLabel } from './element-label';
import { useI18n } from './i18n-react';
import { useEditorStore, useEditorStoreApi } from './state';

interface Row {
  node: ElementNode;
  depth: number;
  parent: string | null;
  hasChildren: boolean;
  position: number;
  setSize: number;
}

function flatten(root: readonly ElementNode[], expanded: ReadonlySet<string>): Row[] {
  const rows: Row[] = [];
  const stack = root
    .map((node, index) => ({
      node,
      depth: 1,
      parent: null as string | null,
      position: index + 1,
      setSize: root.length,
    }))
    .reverse();
  while (stack.length) {
    const item = stack.pop();
    if (!item) continue;
    rows.push({ ...item, hasChildren: item.node.children.length > 0 });
    if (expanded.has(item.node.id)) {
      for (let i = item.node.children.length - 1; i >= 0; i -= 1) {
        const child = item.node.children[i];
        if (child)
          stack.push({
            node: child,
            depth: item.depth + 1,
            parent: item.node.id,
            position: i + 1,
            setSize: item.node.children.length,
          });
      }
    }
  }
  return rows;
}

const OutlineItem = memo(function OutlineItem({
  node,
  depth,
  parent,
  hasChildren,
  position,
  setSize,
  expanded,
  tabIndex,
  onFocus,
  onKeyDown,
}: {
  node: ElementNode;
  depth: number;
  parent: string | null;
  hasChildren: boolean;
  position: number;
  setSize: number;
  expanded: boolean;
  tabIndex: number;
  onFocus: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>, id: string) => void;
}) {
  const store = useEditorStoreApi();
  const selected = useEditorStore((state) => state.selectedId === node.id);
  const setExpanded = useEditorStore((state) => state.setExpanded);
  return (
    <div
      role="treeitem"
      aria-level={depth}
      aria-selected={selected}
      aria-expanded={hasChildren ? expanded : undefined}
      aria-posinset={position}
      aria-setsize={setSize}
      data-id={node.id}
      data-parent={parent ?? undefined}
      tabIndex={tabIndex}
      className="blx-outline-item ed-focus-ring"
      onFocus={onFocus}
      onKeyDown={(event) => {
        onKeyDown(event, node.id);
      }}
      onMouseEnter={() => {
        store.getState().hover(node.id);
      }}
      onMouseLeave={() => {
        store.getState().hover(null);
      }}
      onClick={() => {
        store.getState().select(node.id);
      }}
    >
      <span
        aria-hidden="true"
        className="blx-tree-toggle"
        onClick={(event) => {
          event.stopPropagation();
          if (hasChildren) {
            setExpanded(node.id, !expanded);
            if (expanded) {
              const item = event.currentTarget.parentElement;
              if (item instanceof HTMLElement) {
                onFocus();
                item.focus();
              }
            }
          }
        }}
      >
        {hasChildren ? (expanded ? '▾' : '▸') : '·'}
      </span>
      <span>
        {elementLabel(node.type)} <span className="blx-outline-id">{node.id}</span>
      </span>
    </div>
  );
});

/** Accessible virtual tree: collapsed descendants are not mounted, keeping large documents responsive. */
export function StructurePanel() {
  const { t, dir } = useI18n();
  const status = useEditorStore((state) => state.status);
  const error = useEditorStore((state) => state.error);
  const root = useEditorStore((state) => state.document?.root ?? null);
  const selectedId = useEditorStore((state) => state.selectedId);
  const focusedIdState = useState<string | null>(null);
  const focusedId = focusedIdState[0];
  const setFocusedId = focusedIdState[1];
  const expandedIds = useEditorStore((state) => state.expandedIds);
  const setExpanded = useEditorStore((state) => state.setExpanded);
  const store = useEditorStoreApi();
  const treeRef = useRef<HTMLDivElement>(null);
  const expanded = useMemo(() => new Set(expandedIds), [expandedIds]);
  const rows = useMemo(() => flatten(root ?? [], expanded), [root, expanded]);
  const rowsRef = useRef(rows);
  const expandedRef = useRef(expanded);
  useLayoutEffect(() => {
    rowsRef.current = rows;
    expandedRef.current = expanded;
  }, [rows, expanded]);
  useEffect(() => {
    const currentRoot = store.getState().document?.root;
    if (selectedId === null || currentRoot === undefined) return;
    const path = findPath(currentRoot, selectedId);
    if (path === null) return;
    const ancestors: string[] = [];
    for (let index = 1; index < path.length; index += 1) {
      const ancestor = nodeAt(currentRoot, path.slice(0, index));
      if (ancestor) ancestors.push(ancestor.id);
    }
    store.getState().expandMany(ancestors);
  }, [selectedId, store]);
  const keyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>, id: string) => {
      const rows = rowsRef.current;
      const expanded = expandedRef.current;
      const index = rows.findIndex((row) => row.node.id === id);
      const row = rows[index];
      const rtl = dir === 'rtl';
      const left = rtl ? 'ArrowRight' : 'ArrowLeft';
      const right = rtl ? 'ArrowLeft' : 'ArrowRight';
      let target = index;
      if (event.key === 'ArrowDown') target = Math.min(rows.length - 1, index + 1);
      else if (event.key === 'ArrowUp') target = Math.max(0, index - 1);
      else if (event.key === 'Home') target = 0;
      else if (event.key === 'End') target = rows.length - 1;
      else if (event.key === right && row?.hasChildren && !expanded.has(id)) setExpanded(id, true);
      else if (event.key === right && row?.hasChildren && expanded.has(id)) target = index + 1;
      else if (event.key === left && row && expanded.has(id)) setExpanded(id, false);
      else if (event.key === left && row?.parent) target = rows.findIndex((item) => item.node.id === row.parent);
      else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        store.getState().select(id);
        return;
      } else return;
      event.preventDefault();
      const next = rows[target];
      if (target !== index && next) {
        setFocusedId(next.node.id);
        treeRef.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(next.node.id)}"]`)?.focus();
      }
    },
    [dir, setExpanded, setFocusedId, store],
  );

  let body;
  if (status === 'error' && error !== null) {
    body = <p className="blx-empty">{t('panel.structure.loadFailed')}</p>;
  } else if (root !== null && root.length > 0) {
    body = (
      <div role="tree" aria-label={t('panel.structure.list')} className="blx-outline" ref={treeRef}>
        {rows.map((row) => (
          <OutlineItem
            key={row.node.id}
            {...row}
            expanded={expanded.has(row.node.id)}
            tabIndex={(focusedId ?? rows[0]?.node.id) === row.node.id ? 0 : -1}
            onFocus={() => {
              setFocusedId(row.node.id);
            }}
            onKeyDown={keyDown}
          />
        ))}
      </div>
    );
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
