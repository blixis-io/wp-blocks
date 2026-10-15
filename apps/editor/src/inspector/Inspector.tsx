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
    family === 'text' ? (
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
    return <p className="blx-empty">{t(`inspector.${tab}.empty` as never)}</p>;
  if (tab === 'style')
    return (
      <section aria-label={t('inspector.style')}>
        <h3>{t(`inspector.viewport.${viewport}` as never)}</h3>
        {STYLE_FIELDS.map((field) => (
          <StyleControl
            key={field.id}
            element={element}
            field={field}
            breakpoint={breakpoint}
            breakpoints={breakpoints}
            editable={editable}
          />
        ))}
      </section>
    );
  const fields = Object.entries<PropDefinition>(definition.props).filter(([propId, prop]) =>
    propertyBelongsToTab(propId, prop, tab),
  );
  return fields.length ? (
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
      {element.type === 'blixis/image' && tab === 'content' && element.props['decorative'] !== true && !altValue ? (
        <p id={`inspector-${element.id}-${locale}-alt-warning`} role="status" className="blx-inspector-hint">
          {t('inspector.image.altWarning')}
        </p>
      ) : null}
    </fieldset>
  ) : (
    <p className="blx-empty">
      {tab === 'content' && (element.type === 'blixis/section' || element.type === 'blixis/container')
        ? t('inspector.content.none')
        : t(`inspector.${tab}.empty` as never)}
    </p>
  );
}
