import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@blixis/wp-editor-ui';
import { isSafeUrl, valueSchemaFor, type PropDefinition } from '@blixis/wp-element-registry';
import type { ElementNode, Json } from '@blixis/wp-core';
import { useEditorStore, useEditorStoreApi } from '../state';
import { useI18n } from '../i18n-react';
import { STYLE_FIELDS } from './style-mapping';
import { StyleControl } from './controls/style-control';
import { controlFamilyFor, propertyBelongsToTab, type InspectorTab } from './control-mapping';
import { TextControl } from './controls/text-control';
import { NumberControl } from './controls/number-control';
import { ChoiceControl } from './controls/choice-control';
import { MediaControl } from './controls/media-control';
import { InspectorSection } from './InspectorSection';
import { PROPERTIES } from '@blixis/wp-style-engine';
import { BoxModelControl } from './controls/box-model-control';
import { richToPlain, type RichText } from '@blixis/wp-core';

type Tab = InspectorTab;

function PropField({
  element,
  name,
  definition,
  editable,
  locale,
  editTarget,
  startEdit,
  setEditText,
  endEdit,
}: {
  element: ElementNode;
  name: string;
  definition: PropDefinition;
  editable: boolean;
  locale: string;
  editTarget?: { id: string; prop: string; value?: string | RichText } | null | undefined;
  startEdit: (id: string, prop: string, focus?: boolean) => void;
  setEditText: (text: string) => void;
  endEdit: (commit: boolean) => void;
}) {
  const { t } = useI18n();
  const store = useEditorStoreApi();
  const inspectorEditStarted = useRef(false);
  // The field owns what is typed until it blurs: the canvas session answers asynchronously, and a controlled value that
  // snapped back to the stored text on the first keystroke would swallow the input.
  const [localText, setLocalText] = useState<string | null>(null);
  const translated = definition.classification !== 'invariant';
  const storedValue = useEditorStore((s) =>
    translated ? s.document?.translations[locale]?.[element.id]?.values[name] : element.props[name],
  );
  const isCanvasEditing = editTarget?.id === element.id && editTarget.prop === name;
  const value = isCanvasEditing && Object.hasOwn(editTarget, 'value') ? editTarget.value : storedValue;
  const initial =
    typeof value === 'string'
      ? value
      : typeof value === 'number'
        ? String(value)
        : definition.kind === 'integer' || definition.kind === 'media'
          ? String(definition.default ?? '')
          : '';
  const [local, setLocal] = useState({ source: initial, draft: initial, error: '' });
  const [interaction, setInteraction] = useState({ focused: false, dirty: false });
  if (local.source !== initial && !interaction.focused && !interaction.dirty) {
    setLocal({ source: initial, draft: initial, error: '' });
  }
  const draft = local.source !== initial && !interaction.focused && !interaction.dirty ? initial : local.draft;
  const error = local.source !== initial && !interaction.focused && !interaction.dirty ? '' : local.error;
  const setDraft = (value: string) => {
    setLocal((current) => ({ ...current, draft: value }));
    setInteraction((current) => ({ ...current, dirty: true }));
  };
  const setError = (value: string) => {
    setLocal((current) => ({ ...current, error: value }));
  };
  const fieldId = `inspector-${element.id}-${locale}-${name}`;
  const errorId = `${fieldId}-error`;
  const dispatch = (next: Json) => {
    if (definition.kind === 'url' && typeof next === 'string' && !isSafeUrl(next)) {
      setError(t('inspector.error.url'));
      return;
    }
    if (!valueSchemaFor(definition).safeParse(next).success) {
      setError(t('inspector.error.invalid'));
      return;
    }
    const result = translated
      ? store
          .getState()
          .dispatch(
            { type: 'set-translation', locale, elementId: element.id, set: { [name]: next } },
            { coalesceKey: `${element.id}:${locale}:${name}` },
          )
      : store
          .getState()
          .dispatch(
            { type: 'update-props', id: element.id, set: { [name]: next } },
            { coalesceKey: `${element.id}:${name}` },
          );
    setError(result.ok ? '' : t('inspector.error.invalid'));
    if (result.ok) setInteraction((current) => ({ ...current, dirty: false }));
  };
  const label = t(`inspector.prop.${name}` as never);
  const isRichValue = definition.kind === 'text' && value !== null && typeof value === 'object' && 'inline' in value;
  const family = controlFamilyFor(definition);
  const controlProps = {
    id: fieldId,
    name,
    definition,
    value: value as Json | undefined,
    draft,
    disabled: !editable,
    readOnly: isCanvasEditing,
    describedBy:
      [
        error ? errorId : '',
        definition.kind === 'media' ? `${fieldId}-hint` : '',
        element.type === 'blixis/image' && name === 'alt' && element.props['decorative'] !== true
          ? `inspector-${element.id}-${locale}-alt-warning`
          : '',
      ]
        .filter(Boolean)
        .join(' ') || undefined,
    onDraft: (next: string) => {
      setDraft(next);
    },
    onCommit: dispatch,
    onFocus: () => {
      setInteraction((current) => ({ ...current, focused: true }));
    },
    onBlur: () => {
      setInteraction({ focused: false, dirty: false });
      if (definition.kind === 'url') dispatch(draft);
    },
  };
  const richTextDraft = !isRichValue
    ? ''
    : isCanvasEditing && Object.hasOwn(editTarget, 'value')
      ? typeof value === 'string'
        ? value
        : richToPlain(value as unknown as RichText)
      : richToPlain((storedValue ?? value) as RichText);
  const control = isRichValue ? (
    <textarea
      id={fieldId}
      aria-label={label}
      value={localText ?? richTextDraft}
      disabled={!editable}
      aria-describedby={`${fieldId}-rich-hint`}
      onChange={(event) => {
        if (!isCanvasEditing && !inspectorEditStarted.current) {
          inspectorEditStarted.current = true;
          startEdit(element.id, name, false);
        }
        setLocalText(event.target.value);
        setEditText(event.target.value);
      }}
      onBlur={() => {
        if (inspectorEditStarted.current || isCanvasEditing) endEdit(true);
        inspectorEditStarted.current = false;
        setLocalText(null);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && isCanvasEditing) {
          event.preventDefault();
          inspectorEditStarted.current = false;
          setLocalText(null);
          endEdit(false);
        }
      }}
    />
  ) : name === 'level' ? (
    <select
      id={fieldId}
      aria-label={label}
      value={typeof value === 'number' ? String(value) : String(definition.default ?? 2)}
      disabled={!editable}
      onChange={(event) => {
        dispatch(Number(event.target.value));
      }}
    >
      {[1, 2, 3, 4, 5, 6].map((level) => (
        <option key={level} value={level}>
          H{level}
        </option>
      ))}
    </select>
  ) : family === 'text' ? (
    <TextControl {...controlProps} />
  ) : family === 'number' ? (
    <NumberControl {...controlProps} />
  ) : family === 'choice' ? (
    <ChoiceControl {...controlProps} />
  ) : (
    <MediaControl {...controlProps} />
  );
  return (
    <div className="blx-inspector-field">
      <label htmlFor={fieldId}>{label}</label>
      {control}
      {isRichValue ? (
        <p id={`${fieldId}-rich-hint`} className="blx-inspector-hint">
          {t('inspector.richText.later')}
        </p>
      ) : null}
      {definition.kind === 'media' ? (
        <p id={`${fieldId}-hint`} className="blx-inspector-hint">
          {t('inspector.media.later')}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="blx-inspector-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Inspector({
  element,
  tab,
  editingEnabled,
  editTarget,
  editSelection,
  tokenColors = {},
  sendEditCommand = () => undefined,
  inlineEditing = true,
  onInlineEditingChange = () => undefined,
  startEdit = () => undefined,
  setEditText = () => undefined,
  endEdit = () => undefined,
}: {
  element: ElementNode | null;
  tab: Tab;
  editingEnabled: boolean;
  editTarget?: { id: string; prop: string; status: 'loading' | 'ready'; value?: string | RichText } | null;
  editSelection?: { id: string; empty: boolean; marks: Record<string, unknown>; text: string } | null;
  tokenColors?: Partial<Record<'light' | 'dark', Readonly<Record<string, string>>>>;
  sendEditCommand?: (name: string, args?: Record<string, unknown>) => void;
  inlineEditing?: boolean;
  onInlineEditingChange?: (value: boolean) => void;
  startEdit?: (id: string, prop: string, focus?: boolean) => void;
  setEditText?: (text: string) => void;
  endEdit?: (commit: boolean) => void;
}) {
  const { t } = useI18n();
  const locale = useEditorStore((s) => s.contentLocale);
  const breakpoint = useEditorStore((s) => s.breakpointId);
  const registry = useEditorStore((s) => s.registry);
  const breakpoints = useEditorStore((s) => s.breakpoints);
  const viewport = useEditorStore((s) => s.viewport);
  const altValue = useEditorStore((s) =>
    element ? s.document?.translations[locale]?.[element.id]?.values['alt'] : undefined,
  );
  const definition = useMemo(() => (element === null ? undefined : registry.get(element.type)), [element, registry]);
  const editable = editingEnabled && definition !== undefined;
  if (element === null || definition === undefined)
    return (
      <p className="blx-empty">
        {tab === 'advanced' ? t('inspector.comingSoon') : t(`inspector.${tab}.empty` as never)}
      </p>
    );
  if (tab === 'advanced')
    return (
      <p className="blx-empty" aria-disabled="true">
        {t('inspector.comingSoon')}
      </p>
    );
  if (tab === 'style')
    return (
      <div className="blx-inspector-sections">
        <p className="blx-inspector-viewport">{t(`inspector.viewport.${viewport}` as never)}</p>
        {(['typography', 'color', 'boxModel', 'layout', 'effects'] as const).map((group) => {
          const groupIds: Record<typeof group, string[]> = {
            typography: ['font-family', 'font-weight', 'font-size', 'line-height', 'letter-spacing', 'text-transform'],
            color: ['color', 'background-color'],
            boxModel: [],
            layout: ['width', 'height', 'text-align', 'display'],
            effects: ['border-radius', 'border-style', 'border-color', 'box-shadow'],
          };
          const fields = STYLE_FIELDS.filter(
            (field) =>
              groupIds[group].includes(field.id) &&
              definition.styleProperties.includes(field.id) &&
              PROPERTIES.has(field.id),
          );
          return (
            <InspectorSection
              key={group}
              id={`style-${group}`}
              title={t(`inspector.section.${group}` as never)}
              defaultCollapsed={group === 'layout' || group === 'effects'}
            >
              {group === 'boxModel' ? (
                <BoxModelControl
                  element={element}
                  breakpoint={breakpoint}
                  breakpoints={breakpoints}
                  editable={editable}
                />
              ) : null}
              {fields.map((field) => (
                <StyleControl
                  key={field.id}
                  element={element}
                  field={field}
                  breakpoint={breakpoint}
                  breakpoints={breakpoints}
                  viewport={viewport}
                  editable={editable}
                />
              ))}
              {group === 'color' ? (
                <DisabledPlaceholder
                  title={t('inspector.gradient')}
                  hint={t('inspector.gradient.hint')}
                  kind="toggle"
                />
              ) : null}
            </InspectorSection>
          );
        })}
      </div>
    );
  const fields = Object.entries<PropDefinition>(definition.props).filter(([propId, prop]) =>
    propertyBelongsToTab(propId, prop, tab),
  );
  return fields.length ? (
    <div className="blx-inspector-sections">
      {editTarget && editSelection && !editSelection.empty && editSelection.id === element.id ? (
        <InspectorSection id="selected-text" title={t('rich.selectedText')}>
          <SelectedTextControls selection={editSelection} command={sendEditCommand} tokenColors={tokenColors} />
        </InspectorSection>
      ) : null}
      <InspectorSection
        id={`content-${element.type}`}
        title={t(`element.${element.type.replace('blixis/', '')}` as never)}
      >
        <div className="blx-inspector-group" role="group" aria-label={t(`inspector.${tab}` as never)}>
          {fields.map(([name, prop]) => (
            <PropField
              key={`${element.id}:${locale}:${name}`}
              element={element}
              name={name}
              definition={prop}
              editable={editable}
              locale={locale}
              editTarget={editTarget}
              startEdit={startEdit}
              setEditText={setEditText}
              endEdit={endEdit}
            />
          ))}
          {element.type === 'blixis/image' && element.props['decorative'] !== true && !altValue ? (
            <p id={`inspector-${element.id}-${locale}-alt-warning`} role="status" className="blx-inspector-hint">
              {t('inspector.image.altWarning')}
            </p>
          ) : null}
          {Object.hasOwn(definition.props, 'level') || Object.hasOwn(definition.props, 'tag') ? (
            <p className="blx-inspector-hint">{t('inspector.htmlTag.hint')}</p>
          ) : null}
        </div>
      </InspectorSection>
      {Object.hasOwn(definition.props, 'href') ? (
        <InspectorSection id={`link-${element.id}`} title={t('inspector.link')}>
          <div className="blx-inspector-field">
            <label htmlFor={`link-to-${element.id}`}>{t('inspector.linkTo')}</label>
            <select
              id={`link-to-${element.id}`}
              disabled
              aria-disabled="true"
              aria-describedby={`link-to-hint-${element.id}`}
            >
              <option>{t('inspector.link.none')}</option>
            </select>
            <p id={`link-to-hint-${element.id}`} className="blx-inspector-hint">
              {t('inspector.linkTarget.hint')}
            </p>
          </div>
        </InspectorSection>
      ) : null}
      <InspectorSection id="content-source" title={t('inspector.contentSource')}>
        <DisabledPlaceholder title={t('inspector.staticContent')} hint={t('inspector.contentSource.hint')} />
      </InspectorSection>
      <InspectorSection id="inline-editing" title={t('inspector.inlineEditing')}>
        <label className="blx-inspector-field">
          <span>{t('inspector.inlineEditing')}</span>
          <button
            type="button"
            role="switch"
            aria-checked={inlineEditing}
            onClick={() => {
              onInlineEditingChange(!inlineEditing);
            }}
          >
            {inlineEditing ? 'On' : 'Off'}
          </button>
        </label>
      </InspectorSection>
      <InspectorSection id="translation" title={t('inspector.translation')}>
        <DisabledPlaceholder title={t('inspector.translation')} hint={t('inspector.translation.hint')} kind="toggle" />
      </InspectorSection>
      {Object.entries<PropDefinition>(definition.props).some(
        ([propId, prop]) => propId === 'text' && prop.kind === 'text',
      ) ? (
        <InspectorSection id="text-formatting" title={t('inspector.textFormatting')}>
          <TextFormattingControls
            active={editTarget?.id === element.id && editTarget.status === 'ready'}
            marks={editSelection?.id === element.id ? editSelection.marks : {}}
            command={sendEditCommand}
          />
        </InspectorSection>
      ) : null}
    </div>
  ) : (
    <p className="blx-empty">
      {element.type === 'blixis/section' || element.type === 'blixis/container'
        ? t('inspector.content.none')
        : t(`inspector.${tab}.empty` as never)}
    </p>
  );
}

function TextFormattingControls({
  active,
  marks,
  command,
}: {
  active: boolean;
  marks: Record<string, unknown>;
  command: (name: string, args?: Record<string, unknown>) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const link = (marks['link'] ?? {}) as { href?: string; newTab?: boolean };
  const linkSource = `${link.href ?? ''}\u0000${String(link.newTab ?? false)}`;
  const [hrefDraft, setHrefDraft] = useState({ source: linkSource, value: link.href ?? '' });
  const href = hrefDraft.source === linkSource ? hrefDraft.value : (link.href ?? '');
  const [newTabDraft, setNewTabDraft] = useState({ source: linkSource, value: link.newTab ?? false });
  const newTab = newTabDraft.source === linkSource ? newTabDraft.value : (link.newTab ?? false);
  const [error, setError] = useState('');
  const linkValid = href.length > 0 && href.length <= 2048 && !hasUrlControl(href) && isSafeUrl(href);
  const hintId = 'inspector-text-formatting-hint';
  const errorId = 'inspector-text-formatting-link-error';
  const execute = (name: string, args?: Record<string, unknown>) => {
    if (args === undefined) command(name);
    else command(name, args);
    setOpen(false);
  };
  return (
    <div className="blx-inspector-field">
      <span className="blx-inspector-inline-label">{t('inspector.textFormatting')}</span>
      <p id={hintId} className="blx-inspector-hint">
        {t('inspector.textFormatting.disabledHint')}
      </p>
      <div role="group" aria-label={t('inspector.textFormatting')} className="blx-text-formatting-controls">
        {(['bold', 'italic', 'underline'] as const).map((mark) => (
          <button
            key={mark}
            type="button"
            aria-label={t(`rich.${mark}`)}
            aria-pressed={Boolean(marks[mark === 'bold' ? 'strong' : mark === 'italic' ? 'em' : 'u'])}
            aria-disabled={!active}
            aria-describedby={!active ? hintId : undefined}
            disabled={!active}
            onClick={() => {
              execute('toggle-mark', { mark });
            }}
          >
            {mark === 'bold' ? 'B' : mark === 'italic' ? 'I' : 'U'}
          </button>
        ))}
        <span className="blx-format-popover-anchor">
          <button
            type="button"
            aria-label={t('inspector.textFormatting.link')}
            aria-expanded={open}
            aria-disabled={!active}
            aria-describedby={!active ? hintId : undefined}
            disabled={!active}
            onClick={() => {
              setHrefDraft({ source: linkSource, value: link.href ?? '' });
              setNewTabDraft({ source: linkSource, value: link.newTab ?? false });
              setError('');
              setOpen(!open);
            }}
          >
            <span aria-hidden="true">↗</span>
          </button>
          {open && active ? (
            <form
              className="blx-format-popover"
              aria-label={t('inspector.textFormatting.link')}
              onSubmit={(event) => {
                event.preventDefault();
                if (!linkValid) {
                  setError(t('inspector.error.url'));
                  return;
                }
                execute('set-link', { href, newTab });
                setError('');
              }}
            >
              <label>
                {t('inspector.textFormatting.linkUrl')}
                <input
                  aria-label={t('inspector.textFormatting.linkUrl')}
                  value={href}
                  maxLength={2048}
                  aria-describedby={error ? errorId : undefined}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    setHrefDraft({ source: linkSource, value: next });
                    if (next.length > 2048 || hasUrlControl(next) || (next !== '' && !isSafeUrl(next)))
                      setError(t('inspector.error.url'));
                    else setError('');
                  }}
                />
              </label>
              <label className="blx-format-new-tab">
                <input
                  type="checkbox"
                  checked={newTab}
                  onChange={(event) => {
                    setNewTabDraft({ source: linkSource, value: event.currentTarget.checked });
                  }}
                />
                {t('rich.newTab')}
              </label>
              {error ? (
                <span id={errorId} role="alert">
                  {error}
                </span>
              ) : null}
              <button type="submit">{t('rich.apply')}</button>
              {link.href ? (
                <button
                  type="button"
                  onClick={() => {
                    execute('clear-link');
                  }}
                >
                  {t('rich.remove')}
                </button>
              ) : null}
            </form>
          ) : null}
        </span>
        <button
          type="button"
          aria-label={t('inspector.textFormatting.clear')}
          aria-disabled={!active}
          aria-describedby={!active ? hintId : undefined}
          disabled={!active}
          onClick={() => {
            execute('clear-marks');
          }}
        >
          Tx
        </button>
      </div>
    </div>
  );
}

function DisabledPlaceholder({
  title,
  hint,
  kind = 'select',
}: {
  title: string;
  hint: string;
  kind?: 'select' | 'toggle';
}) {
  const hintId = `inspector-disabled-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-hint`;
  return (
    <div className={`blx-inspector-field${kind === 'toggle' ? ' blx-gradient-field' : ''}`}>
      {kind === 'toggle' ? (
        <label className="blx-inspector-toggle-row">
          <span>{title}</span>
          <input type="checkbox" aria-label={title} disabled aria-disabled="true" aria-describedby={hintId} />
        </label>
      ) : (
        <>
          <label>{title}</label>
          <select aria-label={title} disabled aria-disabled="true" aria-describedby={hintId}>
            <option>{title}</option>
          </select>
        </>
      )}
      <p id={hintId} className="blx-inspector-hint">
        {hint}
      </p>
    </div>
  );
}

interface SelectedTextSelection {
  id: string;
  empty: boolean;
  text: string;
  marks: Record<string, unknown>;
}
function hasUrlControl(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}
function SelectedTextControls({
  selection,
  command,
  tokenColors,
}: {
  selection: SelectedTextSelection;
  command: (name: string, args?: Record<string, unknown>) => void;
  tokenColors: Partial<Record<'light' | 'dark', Readonly<Record<string, string>>>>;
}) {
  const { t } = useI18n();
  const link = (selection.marks['link'] ?? {}) as { href?: string; target?: string };
  const committedHref = link.href ?? '';
  const linkSource = `${selection.id}\u0000${committedHref}`;
  const targetValue = link.target === '_blank';
  const targetSource = `${selection.id}\u0000${committedHref}\u0000${String(targetValue)}`;
  const [hrefDraft, setHrefDraft] = useState({ source: linkSource, value: committedHref });
  const href = hrefDraft.source === linkSource ? hrefDraft.value : committedHref;
  const [enabledDraft, setEnabledDraft] = useState({ source: linkSource, value: Boolean(committedHref) });
  const linkEnabled = enabledDraft.source === linkSource ? enabledDraft.value : Boolean(committedHref);
  const [linkError, setLinkError] = useState('');
  const [targetDraft, setTargetDraft] = useState({ source: targetSource, value: targetValue });
  const target = targetDraft.source === targetSource ? targetDraft.value : targetValue;
  const marks = selection.marks;
  const style = (marks['style'] ?? {}) as { color?: string; highlight?: string; weight?: string };
  const [whole, setWhole] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const previewStyle = (marks['style'] ?? {}) as { color?: string; highlight?: string };
  const selectedInfo = t('rich.selectedInfo', { text: selection.text.slice(0, 40) });
  const infoTitleEnd = selectedInfo.indexOf('.');
  const previewMode = useEditorStore((state) => state.previewMode);
  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;
    const colors = tokenColors[previewMode] ?? {};
    const color = typeof previewStyle.color === 'string' ? colors[previewStyle.color] : undefined;
    const highlight = typeof previewStyle.highlight === 'string' ? colors[previewStyle.highlight] : undefined;
    if (color) preview.style.setProperty('--blx-selected-text-color', color);
    else preview.style.removeProperty('--blx-selected-text-color');
    if (highlight) preview.style.setProperty('--blx-selected-text-highlight', highlight);
    else preview.style.removeProperty('--blx-selected-text-highlight');
  }, [previewMode, previewStyle.color, previewStyle.highlight, tokenColors]);
  const send = (name: string, args?: Record<string, unknown>) => {
    if (whole) command('apply-to-all', { name, ...(args ? { args } : {}) });
    else command(name, args);
  };
  const focused = (event: React.MouseEvent) => {
    event.preventDefault();
  };
  const token = (label: string, key: 'color' | 'highlight') => (
    <div className="blx-inspector-field blx-selected-color-field">
      <label htmlFor={`rich-${key}`}>{t(label as never)}</label>
      <span
        aria-hidden="true"
        className="blx-selected-token-swatch"
        ref={(node) => {
          const id = style[key];
          const value = typeof id === 'string' ? tokenColors[previewMode]?.[id] : undefined;
          if (value) node?.style.setProperty('--blx-selected-token-swatch', value);
          else node?.style.removeProperty('--blx-selected-token-swatch');
        }}
      />
      <select
        id={`rich-${key}`}
        value={style[key] ?? ''}
        onChange={(e) => {
          send('set-style', { [key]: e.target.value || null });
        }}
      >
        <option value="">{t(key === 'color' ? 'rich.token.default' : 'rich.token.none')}</option>
        {['color-primary', 'color-text', 'color-link', 'color-surface'].map((id) => (
          <option key={id} value={id}>
            {t(`rich.token.${id}` as never)}
          </option>
        ))}
      </select>
    </div>
  );
  return (
    <div className="blx-selected-text-controls">
      <button
        type="button"
        className="blx-inspector-clear-selection"
        onMouseDown={focused}
        onClick={() => {
          command('collapse-selection');
        }}
      >
        {t('rich.clearSelection')}
      </button>
      <div className="blx-selected-info">
        <span className="blx-selected-info-icon" aria-hidden="true">
          Aa
        </span>
        <span>
          <strong>{infoTitleEnd < 0 ? t('rich.selectedText') : selectedInfo.slice(0, infoTitleEnd + 1)}</strong>
          {infoTitleEnd < 0 ? selectedInfo : selectedInfo.slice(infoTitleEnd + 1)}
        </span>
      </div>
      <div className="blx-selected-preview-block">
        <label htmlFor="rich-selected-preview">{t('rich.selectedPreview')}</label>
        <div id="rich-selected-preview" ref={previewRef} className="blx-format-preview">
          {renderSelectedPreview(selection.text, marks)}
        </div>
      </div>
      <div className="blx-inspector-field">
        <label htmlFor="rich-apply-to">{t('rich.applyTo')}</label>
        <select
          id="rich-apply-to"
          value={whole ? 'whole' : 'selection'}
          onChange={(e) => {
            setWhole(e.target.value === 'whole');
          }}
        >
          <option value="selection">{t('rich.selectedOnly')}</option>
          <option value="whole">{t('rich.wholeElement')}</option>
        </select>
      </div>
      {token('rich.color', 'color')}
      {token('rich.highlight', 'highlight')}
      <div className="blx-inspector-field">
        <label htmlFor="rich-weight">{t('rich.weight')}</label>
        <select
          id="rich-weight"
          value={style.weight ?? 'normal'}
          onChange={(e) => {
            send('set-style', { weight: e.target.value === 'normal' ? null : e.target.value });
          }}
        >
          {(['normal', 'medium', 'bold'] as const).map((weight) => (
            <option key={weight} value={weight}>
              {t(`rich.weight.${weight}` as never)}
            </option>
          ))}
        </select>
      </div>
      <div className="blx-inspector-field blx-selected-segments-field">
        <span className="blx-selected-field-label">{t('rich.weight')}</span>
        <div role="group" aria-label={t('rich.weight')} className="blx-rich-weight-segments">
          {(['normal', 'medium', 'bold'] as const).map((weight) => (
            <button
              key={weight}
              type="button"
              aria-pressed={(style.weight ?? 'normal') === weight}
              onMouseDown={focused}
              onClick={() => {
                send('set-style', { weight: weight === 'normal' ? null : weight });
              }}
            >
              {t(`rich.weight.${weight}` as never)}
            </button>
          ))}
        </div>
      </div>
      <div className="blx-inspector-field blx-selected-segments-field">
        <span className="blx-selected-field-label">{t('rich.textStyle')}</span>
        <div role="group" aria-label={t('rich.textStyle')} className="blx-rich-text-style">
          {(['italic', 'underline', 'strike'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-label={t(`rich.${m}`)}
              aria-pressed={Boolean(marks[({ italic: 'em', underline: 'u', strike: 's' } as const)[m]])}
              onMouseDown={focused}
              onClick={() => {
                send('toggle-mark', { mark: m });
              }}
            >
              <Icon name={m === 'strike' ? 'strikethrough' : m} size={16} />
            </button>
          ))}
        </div>
      </div>
      <div className="blx-inspector-field blx-selected-link-field">
        <label htmlFor="rich-link">{t('rich.link')}</label>
        <input
          id="rich-link"
          className="blx-selected-link-toggle"
          type="checkbox"
          role="switch"
          checked={linkEnabled}
          onChange={(e) => {
            setEnabledDraft({ source: linkSource, value: e.target.checked });
            if (!e.target.checked) {
              send('clear-link');
              setLinkError('');
            } else if (href && isSafeUrl(href) && href.length <= 2048 && !hasUrlControl(href))
              send('set-link', { href, newTab: target });
            else setLinkError(t('inspector.error.url'));
          }}
        />
        <input
          className="blx-selected-link-url"
          id="rich-link-url"
          type="text"
          placeholder="https://"
          aria-label={t('rich.selectedTextLinkUrl')}
          aria-describedby={linkError ? 'rich-link-error' : undefined}
          value={href}
          onChange={(e) => {
            setHrefDraft({ source: linkSource, value: e.target.value });
            const next = e.target.value;
            if (next.length > 2048 || hasUrlControl(next) || (next !== '' && !isSafeUrl(next)))
              setLinkError(t('inspector.error.url'));
            else if (linkError) setLinkError('');
          }}
          onBlur={() => {
            if (href.length > 0 && href.length <= 2048 && isSafeUrl(href) && !hasUrlControl(href)) {
              setLinkError('');
              setEnabledDraft({ source: linkSource, value: true });
              send('set-link', { href, newTab: target });
            } else if (linkEnabled || href.length === 0) setLinkError(t('inspector.error.url'));
          }}
        />
        <div className="blx-selected-new-tab-row">
          <label htmlFor="rich-new-tab">{t('rich.newTab')}</label>
          <input
            id="rich-new-tab"
            type="checkbox"
            checked={target}
            onChange={(e) => {
              setTargetDraft({ source: targetSource, value: e.target.checked });
              if (href && href.length <= 2048 && isSafeUrl(href) && !hasUrlControl(href))
                send('set-link', { href, newTab: e.target.checked });
            }}
          />
        </div>
        {linkError ? (
          <p id="rich-link-error" role="alert">
            {linkError}
          </p>
        ) : null}
        {link.href ? (
          <button
            type="button"
            onMouseDown={focused}
            onClick={() => {
              send('clear-link');
            }}
          >
            {t('rich.removeLink')}
          </button>
        ) : null}
      </div>
      <div className="blx-inspector-field">
        <label htmlFor="rich-inline-style">{t('rich.inlineStyle')}</label>
        <select
          id="rich-inline-style"
          value={marks['code'] ? 'code' : 'span'}
          onChange={(e) => {
            if ((e.currentTarget.value === 'code') !== Boolean(marks['code'])) send('toggle-mark', { mark: 'code' });
          }}
        >
          <option value="span">{t('rich.span')}</option>
          <option value="code">{t('rich.code')}</option>
        </select>
      </div>
      <p className="blx-selected-tip">
        <span aria-hidden="true">♧</span>
        {t('rich.selectionTip')}
      </p>
    </div>
  );
}

function renderSelectedPreview(text: string, marks: Record<string, unknown>) {
  let content: React.ReactNode = text;
  for (const [name, Tag] of [
    ['code', 'code'],
    ['s', 's'],
    ['u', 'u'],
    ['em', 'em'],
    ['strong', 'strong'],
  ] as const) {
    if (marks[name]) content = <Tag>{content}</Tag>;
  }
  return content;
}
