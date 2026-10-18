import {
  Icon,
  PanelToggleIcon,
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  elementIconName,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@blixis/wp-editor-ui';
import type { ElementNode } from '@blixis/wp-core';
import type { ElementDefinition } from '@blixis/wp-element-registry';
import { findPath, nodeAt } from '@blixis/wp-core';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { MessageKey } from './messages/en_US';
import { elementLabel } from './element-label';
import { useI18n } from './i18n-react';
import { useEditorStore, useEditorStoreApi } from './state';
import { ElementId } from './ElementId';
import { readSessionStorage, writeSessionStorage } from './storage';
import { ELEMENT_DEFINITIONS_V2, ELEMENT_PALETTE_V2, getElementDefinitionV2 } from '@blixis/wp-element-registry';

interface Row {
  node: ElementNode;
  depth: number;
  parent: string | null;
  hasChildren: boolean;
  position: number;
  setSize: number;
  guideStops: boolean[];
}
const PALETTE_CATEGORIES = [
  'layout',
  'content',
  'media',
  'navigation',
  'interactive',
  'forms',
  'wordpress',
  'commerce',
  'ui-components',
  'advanced-motion',
] as const;
let nextCreatedElementId = 0;

function flatten(root: readonly ElementNode[], expanded: ReadonlySet<string>): Row[] {
  const rows: Row[] = [];
  const stack = root
    .map((node, index) => ({
      node,
      depth: 1,
      parent: null as string | null,
      position: index + 1,
      setSize: root.length,
      guideStops: [] as boolean[],
    }))
    .reverse();
  while (stack.length) {
    const item = stack.pop();
    if (!item) continue;
    rows.push({ ...item, hasChildren: item.node.children.length > 0 });
    if (expanded.has(item.node.id))
      for (let i = item.node.children.length - 1; i >= 0; i -= 1) {
        const child = item.node.children[i];
        if (child)
          stack.push({
            node: child,
            depth: item.depth + 1,
            parent: item.node.id,
            position: i + 1,
            setSize: item.node.children.length,
            guideStops: [...item.guideStops, i === item.node.children.length - 1],
          });
      }
  }
  return rows;
}

function filterRows(
  root: readonly ElementNode[],
  query: string,
  translate: (key: MessageKey) => string,
): { rows: Row[]; matches: number } {
  const allIds = new Set<string>();
  const pending = [...root];
  while (pending.length) {
    const node = pending.pop();
    if (!node) continue;
    allIds.add(node.id);
    pending.push(...node.children);
  }
  const all = flatten(root, allIds);
  if (!query.trim()) return { rows: flatten(root, new Set()), matches: all.length };
  const needle = query.trim().toLocaleLowerCase();
  const matched = new Set(
    all
      .filter(({ node }) =>
        `${elementLabel(node.type, translate)} ${node.type} ${node.id}`.toLocaleLowerCase().includes(needle),
      )
      .map(({ node }) => node.id),
  );
  const visible = new Set(matched);
  for (const id of matched) {
    const path = findPath(root, id);
    if (!path) continue;
    for (let length = 1; length < path.length; length += 1) {
      const ancestor = nodeAt(root, path.slice(0, length));
      if (ancestor) visible.add(ancestor.id);
    }
  }
  return { rows: all.filter(({ node }) => visible.has(node.id)), matches: matched.size };
}

function highlight(text: string, query: string) {
  const needle = query.trim();
  const index = needle ? text.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase()) : -1;
  return index < 0 ? (
    text
  ) : (
    <>
      {text.slice(0, index)}
      <mark className="blx-search-match">{text.slice(index, index + needle.length)}</mark>
      {text.slice(index + needle.length)}
    </>
  );
}

const OutlineItem = memo(function OutlineItem({
  node,
  depth,
  parent,
  hasChildren,
  position,
  setSize,
  guideStops: rowGuideStops,
  expanded,
  tabIndex,
  query,
  onFocus,
  onKeyDown,
}: {
  node: ElementNode;
  depth: number;
  parent: string | null;
  hasChildren: boolean;
  position: number;
  setSize: number;
  guideStops: boolean[];
  expanded: boolean;
  tabIndex: number;
  query: string;
  onFocus: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>, id: string) => void;
}) {
  const { t } = useI18n();
  const store = useEditorStoreApi();
  const selected = useEditorStore((state) => state.selectedId === node.id);
  const documentRoot = useEditorStore((state) => state.document?.root ?? []);
  const parentNode = parent
    ? (() => {
        const path = findPath(documentRoot, parent);
        return path ? nodeAt(documentRoot, path) : undefined;
      })()
    : undefined;
  const parentStructure = parentNode
    ? (getElementDefinitionV2(parentNode.type)?.['structure'] as Record<string, unknown> | undefined)
    : undefined;
  const minimum = typeof parentStructure?.['minChildren'] === 'number' ? parentStructure['minChildren'] : 0;
  const canDelete = !parentNode || parentNode.children.length > minimum;
  const setExpanded = useEditorStore((state) => state.setExpanded);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (menuOpen) menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [menuOpen]);
  return (
    <div
      role="treeitem"
      aria-labelledby={`blx-tree-label-${node.id}`}
      aria-level={depth}
      aria-selected={selected}
      aria-expanded={hasChildren ? expanded : undefined}
      aria-posinset={position}
      aria-setsize={setSize}
      data-id={node.id}
      data-parent={parent ?? undefined}
      data-last-child={position === setSize ? 'true' : 'false'}
      tabIndex={tabIndex}
      style={{ '--tree-depth': String(depth - 1), '--tree-level': String(depth) } as CSSProperties}
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
      onClick={() => store.getState().select(node.id)}
    >
      {hasChildren ? (
        <button
          type="button"
          className="blx-tree-toggle ed-focus-ring"
          aria-label={`${t(expanded ? 'panel.tree.collapse' : 'panel.tree.expand')}: ${elementLabel(node.type, t)}`}
          tabIndex={-1}
          onClick={(event) => {
            event.stopPropagation();
            setExpanded(node.id, !expanded);
          }}
        >
          <Icon name="chevronRight" size={14} {...(expanded ? { className: 'is-expanded' } : {})} mirrorInRtl />
        </button>
      ) : (
        <span className="blx-tree-toggle" aria-hidden="true" />
      )}
      {depth > 1 ? (
        <span className="blx-tree-guides" aria-hidden="true">
          {Array.from({ length: depth - 1 }, (_, index) => (
            <span
              key={index}
              className="blx-tree-guide"
              style={{ '--guide-depth': String(index) } as CSSProperties}
              data-guide-stop={
                rowGuideStops.slice(index).every(Boolean) && (node.children.length === 0 || !expanded)
                  ? 'true'
                  : 'false'
              }
            />
          ))}
        </span>
      ) : null}
      <Icon name={elementIconName(node.type)} size={16} className="blx-tree-icon" />
      <span id={`blx-tree-label-${node.id}`} className="blx-outline-label">
        {highlight(elementLabel(node.type, t), query)} <ElementId id={node.id} />
        {query && node.type.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) ? (
          <span aria-hidden="true" className="blx-outline-type">
            {highlight(node.type, query)}
          </span>
        ) : null}
      </span>
      <button
        ref={menuTriggerRef}
        type="button"
        className="blx-row-menu-trigger ed-focus-ring"
        aria-label={t('panel.rowMenu')}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={(event) => {
          event.stopPropagation();
          setMenuOpen((open) => !open);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setMenuOpen(false);
          else if (event.key === 'ArrowDown') {
            event.preventDefault();
            setMenuOpen(true);
          }
        }}
      >
        <span aria-hidden="true">…</span>
      </button>
      {menuOpen ? (
        <div
          ref={menuRef}
          role="menu"
          tabIndex={-1}
          className="blx-row-menu"
          onClick={(event) => {
            event.stopPropagation();
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Escape') {
              setMenuOpen(false);
              menuTriggerRef.current?.focus();
            } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
            }
          }}
        >
          <button
            type="button"
            role="menuitem"
            disabled={!canDelete}
            onClick={() => {
              store.getState().dispatch({ type: 'remove', id: node.id });
              setMenuOpen(false);
            }}
          >
            {t('panel.delete')}
          </button>
        </div>
      ) : null}
    </div>
  );
});

export function StructurePanel({
  editingEnabled,
  onCollapse,
  expanded: panelExpanded,
}: {
  editingEnabled: boolean;
  onCollapse?: () => void;
  expanded?: boolean;
}) {
  const { t, dir } = useI18n();
  const status = useEditorStore((state) => state.status);
  const error = useEditorStore((state) => state.error);
  const root = useEditorStore((state) => state.document?.root ?? null);
  const selectedId = useEditorStore((state) => state.selectedId);
  const expandedIds = useEditorStore((state) => state.expandedIds);
  const setExpanded = useEditorStore((state) => state.setExpanded);
  const store = useEditorStoreApi();
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState(() =>
    readSessionStorage('blixis-left-tab') === 'elements' ? 'elements' : 'structure',
  );
  useEffect(() => {
    const openElements = () => {
      setTab('elements');
      writeSessionStorage('blixis-left-tab', 'elements');
    };
    document.addEventListener('blixis:open-elements', openElements);
    return () => {
      document.removeEventListener('blixis:open-elements', openElements);
    };
  }, []);
  const treeRef = useRef<HTMLDivElement>(null);
  const expanded = useMemo(() => new Set(expandedIds), [expandedIds]);
  const filtered = useMemo(() => filterRows(root ?? [], query, t), [root, query, t]);
  const rows = useMemo(
    () => (query ? filtered.rows : flatten(root ?? [], expanded)),
    [filtered.rows, query, root, expanded],
  );
  const rowsRef = useRef(rows);
  const expandedRef = useRef(expanded);
  useLayoutEffect(() => {
    rowsRef.current = rows;
    expandedRef.current = expanded;
  }, [rows, expanded]);
  useEffect(() => {
    if (selectedId === null || root === null) return;
    const path = findPath(root, selectedId);
    if (!path) return;
    const ancestors = path.slice(1).flatMap((_, index) => {
      const node = nodeAt(root, path.slice(0, index + 1));
      return node ? [node.id] : [];
    });
    store.getState().expandMany(ancestors);
  }, [selectedId, store, root]);
  const keyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>, id: string) => {
      const currentRows = rowsRef.current;
      const currentExpanded = expandedRef.current;
      const index = currentRows.findIndex((row) => row.node.id === id);
      const row = currentRows[index];
      const left = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
      const right = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
      let target = index;
      if (event.key === 'ArrowDown') target = Math.min(currentRows.length - 1, index + 1);
      else if (event.key === 'ArrowUp') target = Math.max(0, index - 1);
      else if (event.key === 'Home') target = 0;
      else if (event.key === 'End') target = currentRows.length - 1;
      else if (event.key === right && row?.hasChildren && !currentExpanded.has(id)) setExpanded(id, true);
      else if (event.key === right && row?.hasChildren) target = index + 1;
      else if (event.key === left && row && currentExpanded.has(id)) setExpanded(id, false);
      else if (event.key === left && row?.parent) target = currentRows.findIndex((item) => item.node.id === row.parent);
      else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        store.getState().select(id);
        return;
      } else return;
      event.preventDefault();
      const next = currentRows[target];
      if (target !== index && next) {
        setFocusedId(next.node.id);
        treeRef.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(next.node.id)}"]`)?.focus();
      }
    },
    [dir, setExpanded, store],
  );
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && query) {
        setQuery('');
        event.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [query]);
  let body;
  if (status === 'error' && error !== null) body = <p className="blx-empty">{t('panel.structure.loadFailed')}</p>;
  else if (root !== null && root.length > 0)
    body = rows.length ? (
      <div role="tree" aria-label={t('panel.structure.list')} className="blx-outline" ref={treeRef}>
        {rows.map((row) => (
          <OutlineItem
            key={row.node.id}
            {...row}
            expanded={query ? true : expanded.has(row.node.id)}
            query={query}
            tabIndex={(focusedId ?? rows[0]?.node.id) === row.node.id ? 0 : -1}
            onFocus={() => {
              setFocusedId(row.node.id);
            }}
            onKeyDown={keyDown}
          />
        ))}
      </div>
    ) : (
      <p className="blx-empty">{t('panel.search.noResults')}</p>
    );
  else if (root !== null) body = <p className="blx-empty">{t('panel.structure.emptyDocument')}</p>;
  else if (status === 'loading')
    body = (
      <p aria-live="polite" className="blx-empty">
        {t('panel.structure.loading')}
      </p>
    );
  else body = <p className="blx-empty">{t('panel.structure.empty')}</p>;
  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        if (value !== 'structure' && value !== 'elements') return;
        setTab(value);
        writeSessionStorage('blixis-left-tab', value);
      }}
      className="blx-left-main"
    >
      <div className="blx-panel-tabbar">
        <TabsList aria-label={t('panel.leftTabs')} className="blx-left-tabs">
          <TabsTrigger value="structure">{t('panel.structure')}</TabsTrigger>
          <TabsTrigger value="elements">{t('panel.elements')}</TabsTrigger>
        </TabsList>
        {onCollapse ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="blx-collapse-button ed-focus-ring"
                aria-label={t('panel.structure.toggle')}
                aria-controls="blx-structure"
                aria-expanded={panelExpanded}
                onClick={onCollapse}
              >
                <PanelToggleIcon side="start" open dir={dir} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t('panel.collapse')}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <TabsContent value="structure" className="blx-structure-content">
        <label className="blx-panel-search">
          <Icon name="search" size={14} />
          <input
            aria-label={t('panel.search')}
            placeholder={t('panel.search')}
            value={query}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
            }}
          />
        </label>
        <p className="sr-only" aria-live="polite">
          {t('panel.search.count', { count: filtered.matches })}
        </p>
        <ScrollArea label={t('panel.structure')} className="blx-structure-scroll">
          {body}
        </ScrollArea>
      </TabsContent>
      <TabsContent value="elements" className="blx-top-elements">
        <Palette editingEnabled={editingEnabled} />
      </TabsContent>
    </Tabs>
  );
}

function Palette({ editingEnabled }: { editingEnabled: boolean }) {
  const { t } = useI18n();
  const registry = useEditorStore((state) => state.registry);
  const [query, setQuery] = useState('');
  const [insertFailed, setInsertFailed] = useState(false);
  const [showPlanned, setShowPlanned] = useState(() => {
    try {
      return window.localStorage.getItem('blixis-show-planned-elements') === 'true';
    } catch {
      return false;
    }
  });
  const buttonRefs = useRef<HTMLButtonElement[]>([]);
  const definitions = useMemo(() => {
    const categoryOrder = new Map(PALETTE_CATEGORIES.map((category, index) => [category, index]));
    const originalOrder = new Map(
      ['blixis/container', 'blixis/section', 'blixis/heading', 'blixis/text', 'blixis/image', 'blixis/button'].map(
        (type, index) => [type, index],
      ),
    );
    return registry
      .list()
      .filter((definition) => {
        const generated = ELEMENT_DEFINITIONS_V2.find((item) => `blixis/${item.id}` === definition.type);
        const paletteEntry = ELEMENT_PALETTE_V2.find((item) => item.id === definition.type);
        const description = typeof generated?.['description'] === 'string' ? generated['description'] : '';
        const keywords = paletteEntry?.keywords ?? '';
        return `${elementLabel(definition.type, t)} ${definition.title} ${definition.type} ${definition.category} ${description} ${keywords}`
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase());
      })
      .sort(
        (a, b) =>
          (originalOrder.has(a.type) ? 0 : 1) - (originalOrder.has(b.type) ? 0 : 1) ||
          (originalOrder.has(a.type) && originalOrder.has(b.type)
            ? (originalOrder.get(a.type) ?? 0) - (originalOrder.get(b.type) ?? 0)
            : (categoryOrder.get(ELEMENT_PALETTE_V2.find((item) => item.id === a.type)?.category ?? a.category) ?? 0) -
                (categoryOrder.get(ELEMENT_PALETTE_V2.find((item) => item.id === b.type)?.category ?? b.category) ??
                  0) || a.title.localeCompare(b.title)),
      );
  }, [registry, query, t]);
  const onGridKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const current = buttonRefs.current.indexOf(document.activeElement as HTMLButtonElement);
    let next = current;
    if (event.key === 'ArrowRight') next = Math.min(definitions.length - 1, current + 1);
    else if (event.key === 'ArrowLeft') next = Math.max(0, current - 1);
    else if (event.key === 'ArrowDown') next = Math.min(definitions.length - 1, current + 3);
    else if (event.key === 'ArrowUp') next = Math.max(0, current - 3);
    else return;
    event.preventDefault();
    buttonRefs.current[next]?.focus();
  };
  return (
    <>
      <label className="blx-panel-search">
        <Icon name="search" size={14} />
        <input
          aria-label={t('panel.search')}
          placeholder={t('panel.search')}
          value={query}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
          }}
        />
      </label>
      <label className="blx-planned-toggle">
        <input
          type="checkbox"
          checked={showPlanned}
          onChange={(event) => {
            setShowPlanned(event.currentTarget.checked);
            try {
              window.localStorage.setItem('blixis-show-planned-elements', String(event.currentTarget.checked));
            } catch {
              /* storage can be unavailable */
            }
          }}
        />
        {t('panel.showPlannedElements')}
      </label>
      {insertFailed ? (
        <p role="status" className="blx-inspector-error">
          {t('panel.palette.insertFailed')}
        </p>
      ) : null}
      <ScrollArea label={t('panel.elements')} className="blx-palette-scroll">
        <div className="blx-palette-groups">
          {PALETTE_CATEGORIES.map((category) => {
            const members = definitions.filter(
              (definition) =>
                (ELEMENT_PALETTE_V2.find((item) => item.id === definition.type)?.category ?? definition.category) ===
                category,
            );
            if (members.length === 0) return null;
            return (
              <section key={category} aria-label={t(`panel.category.${category}`)} className="blx-palette-category">
                <h3>{t(`panel.category.${category}`)}</h3>
                <div className="blx-element-grid">
                  {members.map((definition) => {
                    const index = definitions.indexOf(definition);
                    return (
                      <PaletteCard
                        key={definition.type}
                        definition={definition}
                        index={index}
                        editingEnabled={editingEnabled}
                        onGridKeyDown={onGridKeyDown}
                        onInsertFailure={() => {
                          setInsertFailed(true);
                        }}
                        refButton={(button) => {
                          if (button) buttonRefs.current[index] = button;
                        }}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}
          {showPlanned ? (
            <section aria-label={t('panel.category.planned')} className="blx-palette-category">
              <h3>{t('panel.category.planned')}</h3>
              <div className="blx-element-grid">
                {ELEMENT_DEFINITIONS_V2.filter(
                  (item) =>
                    item.status === 'planned' &&
                    `${typeof item['title'] === 'string' ? item['title'] : item.id} ${item.id} ${typeof item['description'] === 'string' ? item['description'] : ''}`
                      .toLocaleLowerCase()
                      .includes(query.trim().toLocaleLowerCase()),
                ).map((item) => {
                  const title = typeof item['title'] === 'string' ? item['title'] : item.id;
                  const subscription = item['subscription'];
                  const subscriptionRecord =
                    subscription !== null && typeof subscription === 'object'
                      ? (subscription as { minimumTier?: unknown })
                      : undefined;
                  const tier =
                    typeof subscriptionRecord?.minimumTier === 'string' ? subscriptionRecord.minimumTier : 'free';
                  return (
                    <div
                      key={item.id}
                      className="blx-element-card blx-element-planned"
                      data-tier={tier}
                      aria-label={`${title}, ${t('panel.planned')}`}
                      aria-disabled="true"
                    >
                      <Icon name={elementIconName(`blixis/${item.id}`)} size={20} />
                      <span>{title}</span>
                      <small>{t('panel.planned')}</small>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>
      </ScrollArea>
    </>
  );
}

type Registry = ReturnType<ReturnType<typeof useEditorStoreApi>['getState']>['registry'];
type EditorDocument = NonNullable<ReturnType<ReturnType<typeof useEditorStoreApi>['getState']>['document']>;

/** Where a palette card inserts its element: into/after the selection, else the page root, else the last root container. */
function paletteInsertionPoint(
  document: EditorDocument,
  selectedId: string | null,
  registry: Registry,
  type: string,
): { parentId: string | null; index: number } | null {
  const hasRoom = (parentId: string | null): boolean => {
    if (parentId === null) return true;
    const path = findPath(document.root, parentId);
    const parent = path ? nodeAt(document.root, path) : undefined;
    if (!parent) return false;
    const structure = getElementDefinitionV2(parent.type)?.['structure'] as Record<string, unknown> | undefined;
    const maximum = structure?.['maxChildren'];
    return typeof maximum !== 'number' || parent.children.length < maximum;
  };
  if (selectedId) {
    const path = findPath(document.root, selectedId);
    const selected = path ? nodeAt(document.root, path) : undefined;
    if (selected && registry.canNest(selected.type, type, 'create') && hasRoom(selected.id))
      return { parentId: selected.id, index: selected.children.length };
    if (path) {
      const parentPath = path.slice(0, -1);
      const parent = parentPath.length ? nodeAt(document.root, parentPath) : undefined;
      if (registry.canNest(parent?.type ?? null, type, 'create') && hasRoom(parent?.id ?? null))
        return { parentId: parent?.id ?? null, index: (path[path.length - 1] ?? -1) + 1 };
    }
  }
  if (registry.canNest(null, type, 'create') && hasRoom(null)) return { parentId: null, index: document.root.length };
  // Nothing selected and the page root does not accept this element: append it to the last root container that does.
  const container = [...document.root]
    .reverse()
    .find((node) => registry.canNest(node.type, type, 'create') && hasRoom(node.id));
  return container ? { parentId: container.id, index: container.children.length } : null;
}

function PaletteCard({
  definition,
  index,
  editingEnabled,
  onGridKeyDown,
  onInsertFailure,
  refButton,
}: {
  definition: ElementDefinition;
  index: number;
  editingEnabled: boolean;
  onGridKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onInsertFailure: () => void;
  refButton: (button: HTMLButtonElement | null) => void;
}) {
  const { t } = useI18n();
  const store = useEditorStoreApi();
  const document = useEditorStore((state) => state.document);
  const selectedId = useEditorStore((state) => state.selectedId);
  const placement = useMemo(
    () => (document ? paletteInsertionPoint(document, selectedId, store.getState().registry, definition.type) : null),
    [document, selectedId, store, definition.type],
  );
  const disabled = !editingEnabled || !placement || !document;
  return (
    <button
      ref={refButton}
      data-element-type={definition.type}
      data-tier={definition.tier}
      type="button"
      className="blx-element-card ed-focus-ring"
      tabIndex={index === 0 ? 0 : -1}
      aria-disabled={disabled}
      onKeyDown={onGridKeyDown}
      onClick={() => {
        if (!editingEnabled || document === null || placement === null) return;
        nextCreatedElementId += 1;
        const element = store
          .getState()
          .registry.createElement(
            definition.type,
            `el-new-${Date.now().toString(36)}-${nextCreatedElementId.toString(36)}`,
          );
        if (!element) {
          onInsertFailure();
          return;
        }
        const result = store.getState().dispatch({ type: 'insert', ...placement, element });
        if (result.ok) store.getState().select(element.id);
        else onInsertFailure();
      }}
    >
      <Icon name={elementIconName(definition.type)} size={20} />
      <span>{elementLabel(definition.type, t)}</span>
    </button>
  );
}
