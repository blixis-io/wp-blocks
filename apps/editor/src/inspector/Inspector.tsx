import { useMemo, useState } from 'react';
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

type Tab = InspectorTab;

function PropField({
  element,
  name,
  definition,
  editable,
  locale,
}: {
  element: ElementNode;
  name: string;
  definition: PropDefinition;
  editable: boolean;
  locale: string;
}) {
  const { t } = useI18n();
  const store = useEditorStoreApi();
  const translated = definition.classification !== 'invariant';
  const value = useEditorStore((s) =>
    translated ? s.document?.translations[locale]?.[element.id]?.values[name] : element.props[name],
  );
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
  const family = controlFamilyFor(definition);
  const controlProps = {
    id: fieldId,
    name,
    definition,
    value,
    draft,
    disabled: !editable,
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
  const control =
    name === 'level' ? (
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
}: {
  element: ElementNode | null;
  tab: Tab;
  editingEnabled: boolean;
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
        {(['typography', 'color', 'spacing', 'layout', 'effects'] as const).map((group) => {
          const groupIds: Record<typeof group, string[]> = {
            typography: ['font-family', 'font-weight', 'font-size', 'line-height', 'letter-spacing', 'text-transform'],
            color: ['color', 'background-color'],
            spacing: ['margin', 'padding'],
            layout: ['width', 'text-align', 'display'],
            effects: ['border-radius', 'border-width', 'border-style', 'border-color', 'box-shadow'],
          };
          const fields = STYLE_FIELDS.filter(
            (field) =>
              groupIds[group].includes(field.id) &&
              definition.styleProperties.includes(field.id) &&
              PROPERTIES.has(field.id),
          );
          return (
            <InspectorSection key={group} id={`style-${group}`} title={t(`inspector.section.${group}` as never)}>
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
      <InspectorSection
        id={`content-${element.type}`}
        title={t(`element.${element.type.replace('blixis/', '')}` as never)}
      >
        <fieldset className="blx-inspector-group">
          <legend>{t(`inspector.${tab}` as never)}</legend>
          {fields.map(([name, prop]) => (
            <PropField
              key={`${element.id}:${locale}:${name}`}
              element={element}
              name={name}
              definition={prop}
              editable={editable}
              locale={locale}
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
        </fieldset>
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
        <DisabledPlaceholder
          title={t('inspector.inlineEditing')}
          hint={t('inspector.inlineEditing.hint')}
          kind="toggle"
        />
      </InspectorSection>
      <InspectorSection id="translation" title={t('inspector.translation')}>
        <DisabledPlaceholder title={t('inspector.translation')} hint={t('inspector.translation.hint')} kind="toggle" />
      </InspectorSection>
      <InspectorSection id="text-formatting" title={t('inspector.textFormatting')}>
        <div className="blx-inspector-disabled-row" aria-disabled="true" title={t('inspector.textFormatting.hint')}>
          {['B', 'I', 'U'].map((item) => (
            <button key={item} type="button" disabled aria-disabled="true">
              {item}
            </button>
          ))}
          <button type="button" disabled aria-disabled="true">
            <span className="sr-only">{t('inspector.formatLink')}</span>↗
          </button>
          <button type="button" disabled aria-disabled="true">
            Tx
          </button>
        </div>
        <p className="blx-inspector-hint">{t('inspector.textFormatting.hint')}</p>
      </InspectorSection>
    </div>
  ) : (
    <p className="blx-empty">
      {element.type === 'blixis/section' || element.type === 'blixis/container'
        ? t('inspector.content.none')
        : t(`inspector.${tab}.empty` as never)}
    </p>
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
