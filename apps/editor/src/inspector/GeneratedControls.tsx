import { useMemo } from 'react';
import { getElementDefinitionV2, isSafeUrl, type GeneratedElementDefinition } from '@blixis/wp-element-registry';
import type { ElementNode, Json } from '@blixis/wp-core';
import { useEditorStore, useEditorStoreApi } from '../state';
import { useI18n } from '../i18n-react';
import { InspectorSection } from './InspectorSection';

type Property = Record<string, unknown>;
const read = (value: unknown): string => (typeof value === 'string' || typeof value === 'number' ? String(value) : '');

/** Inspector controls are driven by properties[].control and use the document's locale streams. */
export function GeneratedControls({ element, editable }: { element: ElementNode; editable: boolean }) {
  const { t } = useI18n();
  const store = useEditorStoreApi();
  const locale = useEditorStore((state) => state.contentLocale);
  const localizedValues = useEditorStore((state) => state.document?.translations[locale]?.[element.id]?.values);
  const legacyDefinition = useEditorStore((state) => state.registry.get(element.type));
  const legacyCoreTypes = new Set([
    'blixis/section',
    'blixis/container',
    'blixis/heading',
    'blixis/text',
    'blixis/image',
    'blixis/button',
  ]);
  const definition = useMemo<GeneratedElementDefinition | undefined>(
    () => getElementDefinitionV2(element.type),
    [element.type],
  );
  if (!definition) return null;
  const groups = definition['groups'] as Record<string, unknown> | undefined;
  const properties = definition['properties'] as Record<string, Property> | undefined;
  const propertyControls = definition['propertyControls'] as Record<string, Property> | undefined;
  if (!properties) return null;
  const grouped = new Map<string, [string, Property][]>();
  for (const entry of Object.entries(properties)) {
    const [name, property] = entry;
    const control = propertyControls?.[name];
    const configured = control ? { ...property, ...control } : property;
    if (
      configured['editorOnly'] === true ||
      typeof configured['control'] !== 'string' ||
      (legacyCoreTypes.has(element.type) && legacyDefinition && Object.hasOwn(legacyDefinition.props, entry[0]))
    )
      continue;
    const group = typeof configured['group'] === 'string' ? configured['group'] : 'content';
    grouped.set(group, [...(grouped.get(group) ?? []), [name, configured]]);
  }
  const legacyProperty = (name: string): string => {
    if (!legacyCoreTypes.has(element.type)) return name;
    if ((element.type === 'blixis/heading' || element.type === 'blixis/text') && name === 'content') return 'text';
    if (element.type === 'blixis/button' && name === 'label') return 'label';
    return name;
  };
  const commit = (name: string, property: Property, value: Json) => {
    const storedName = legacyProperty(name);
    if (property['localizable'] === true) {
      store
        .getState()
        .dispatch({ type: 'set-translation', locale, elementId: element.id, set: { [storedName]: value } });
    } else {
      store.getState().dispatch({ type: 'update-props', id: element.id, set: { [storedName]: value } });
    }
  };
  const title = (group: string) => (typeof groups?.[group] === 'string' ? groups[group] : group);
  return (
    <div className="blx-inspector-sections">
      {[...grouped].map(([group, fields]) => (
        <InspectorSection key={group} id={`generated-${group}`} title={title(group)}>
          {fields.map(([name, property]) => {
            const control = String(property['control']);
            const localizable = property['localizable'] === true;
            const value = localizable
              ? (localizedValues?.[legacyProperty(name)] ?? localizedValues?.[name] ?? property['default'])
              : (element.props[legacyProperty(name)] ?? element.props[name] ?? property['default']);
            const id = `generated-${element.id}-${name}`;
            const label =
              typeof property['label'] === 'string' ? property['label'] : t(`inspector.prop.${name}` as never);
            const common = { id, disabled: !editable, 'aria-label': label };
            if (control === 'switch')
              return (
                <label className="blx-inspector-toggle-row" key={name}>
                  <span>{label}</span>
                  <input
                    {...common}
                    type="checkbox"
                    checked={value === true}
                    onChange={(event) => {
                      commit(name, property, event.currentTarget.checked);
                    }}
                  />
                </label>
              );
            if (control === 'select')
              return (
                <div className="blx-inspector-field" key={name}>
                  <label htmlFor={id}>{label}</label>
                  <select
                    {...common}
                    value={read(value)}
                    onChange={(event) => {
                      commit(name, property, event.currentTarget.value);
                    }}
                  >
                    {(Array.isArray(property['options']) ? property['options'] : []).map((option) => (
                      <option key={String(option)} value={String(option)}>
                        {String(option)}
                      </option>
                    ))}
                  </select>
                </div>
              );
            if (control === 'media-picker')
              return (
                <div className="blx-inspector-field" key={name}>
                  <label htmlFor={id}>{label}</label>
                  <input
                    {...common}
                    type="number"
                    min={1}
                    step={1}
                    value={typeof value === 'string' && /^attachment:[1-9]\d{0,8}$/.test(value) ? value.slice(11) : ''}
                    onChange={(event) => {
                      const next = event.currentTarget.value;
                      if (next === '') {
                        commit(name, property, null);
                        return;
                      }
                      if (/^[1-9]\d{0,8}$/.test(next)) commit(name, property, 'attachment:' + next);
                    }}
                  />
                  <p className="blx-inspector-hint">{t('inspector.generated.attachmentIdHelp')}</p>
                </div>
              );
            if (
              control === 'repeater' ||
              control === 'list' ||
              control === 'navigation-editor' ||
              control === 'media-repeater'
            ) {
              const rows: unknown[] = Array.isArray(value) ? value : [];
              if (control === 'media-repeater' && property['type'] === 'array<asset-ref>') {
                return (
                  <fieldset className="blx-inspector-field" key={name}>
                    <legend>{label}</legend>
                    {rows.map((reference, index) => (
                      <div key={`${name}-${String(index)}`} className="blx-generated-repeater-row">
                        <label>
                          {t('inspector.generated.mediaAsset', { index: index + 1 })}
                          <input
                            type="text"
                            value={read(reference)}
                            placeholder="attachment:42"
                            disabled={!editable}
                            onChange={(event) => {
                              const nextReference = event.currentTarget.value.trim();
                              if (nextReference === '') {
                                commit(name, property, rows.filter((_, rowIndex) => rowIndex !== index) as Json);
                                return;
                              }
                              if (!/^(?:(?:asset:)?[a-zA-Z0-9_-]{1,128}|attachment:[1-9]\d{0,8})$/.test(nextReference))
                                return;
                              commit(
                                name,
                                property,
                                rows.map((old, rowIndex) =>
                                  rowIndex === index ? nextReference : (old as Json),
                                ) as Json,
                              );
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          disabled={!editable}
                          onClick={() => {
                            commit(name, property, rows.filter((_, rowIndex) => rowIndex !== index) as Json);
                          }}
                        >
                          {t('inspector.generated.remove')}
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      disabled={!editable}
                      onClick={() => {
                        commit(name, property, [...(rows as Json[]), null]);
                      }}
                    >
                      {t('inspector.generated.addMediaAsset')}
                    </button>
                    <p className="blx-inspector-hint">{t('inspector.generated.attachmentIdHelp')}</p>
                  </fieldset>
                );
              }
              if (
                control === 'repeater' &&
                name === 'steps' &&
                ['blixis/steps', 'blixis/timeline'].includes(element.type)
              ) {
                return (
                  <fieldset className="blx-inspector-field" key={name}>
                    <legend>{label}</legend>
                    {rows.map((row, index) => {
                      const item =
                        row !== null && typeof row === 'object' && !Array.isArray(row)
                          ? (row as Record<string, Json>)
                          : {};
                      return (
                        <div key={name + '-' + String(index)} className="blx-generated-repeater-row">
                          <label>
                            {t('inspector.generated.stepTitle', { index: index + 1 })}
                            <input
                              value={read(item['title'])}
                              disabled={!editable}
                              onChange={(event) => {
                                const next: Json[] = rows.map((old, rowIndex) =>
                                  rowIndex === index ? { ...item, title: event.currentTarget.value } : (old as Json),
                                );
                                commit(name, property, next);
                              }}
                            />
                          </label>
                          <label>
                            {t('inspector.generated.stepDescription', { index: index + 1 })}
                            <textarea
                              value={read(item['description'])}
                              disabled={!editable}
                              onChange={(event) => {
                                const next: Json[] = rows.map((old, rowIndex) =>
                                  rowIndex === index
                                    ? { ...item, description: event.currentTarget.value }
                                    : (old as Json),
                                );
                                commit(name, property, next);
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            disabled={!editable}
                            onClick={() => {
                              commit(name, property, rows.filter((_, rowIndex) => rowIndex !== index) as Json);
                            }}
                          >
                            {t('inspector.generated.remove')}
                          </button>
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      disabled={!editable}
                      onClick={() => {
                        commit(name, property, [
                          ...(rows as Json[]),
                          { id: 'step-' + String(rows.length + 1), title: '', description: '' },
                        ]);
                      }}
                    >
                      {t('inspector.generated.addStep')}
                    </button>
                  </fieldset>
                );
              }
              return (
                <fieldset className="blx-inspector-field" key={name}>
                  <legend>{label}</legend>
                  {rows.map((row, index) => {
                    const item =
                      row !== null && typeof row === 'object' && !Array.isArray(row)
                        ? (row as Record<string, Json>)
                        : {};
                    const children: Json[] = Array.isArray(item['children']) ? item['children'] : [];
                    return (
                      <div key={`${name}-${String(index)}`} className="blx-generated-repeater-row">
                        <input
                          aria-label={`${label} ${String(index + 1)}`}
                          value={read(item['label'] ?? item['title'])}
                          disabled={!editable}
                          onChange={(event) => {
                            const next: Json[] = rows.map((old, rowIndex) =>
                              rowIndex === index ? { ...item, label: event.currentTarget.value } : (old as Json),
                            );
                            commit(name, property, next);
                          }}
                        />
                        <input
                          type="url"
                          aria-label={`${label} ${String(index + 1)} ${t('inspector.generated.link')}`}
                          value={read(item['href'])}
                          disabled={!editable}
                          onChange={(event) => {
                            const href = event.currentTarget.value;
                            if (href !== '' && !isSafeUrl(href)) return;
                            const next: Json[] = rows.map((old, rowIndex) =>
                              rowIndex === index ? { ...item, href } : (old as Json),
                            );
                            commit(name, property, next);
                          }}
                        />
                        <fieldset>
                          <legend>{t('inspector.generated.children')}</legend>
                          {children.map((child, childIndex) => {
                            const childItem =
                              child !== null && typeof child === 'object' && !Array.isArray(child) ? child : {};
                            return (
                              <label key={`${name}-${String(index)}-${String(childIndex)}`}>
                                {t('inspector.generated.childItem', { index: childIndex + 1 })}
                                <input
                                  value={read(childItem['label'])}
                                  disabled={!editable}
                                  onChange={(event) => {
                                    const nextChildren = children.map((entry, entryIndex) =>
                                      entryIndex === childIndex
                                        ? { ...childItem, label: event.currentTarget.value }
                                        : entry,
                                    );
                                    const next: Json[] = rows.map((old, rowIndex) =>
                                      rowIndex === index ? { ...item, children: nextChildren } : (old as Json),
                                    );
                                    commit(name, property, next);
                                  }}
                                />
                              </label>
                            );
                          })}
                          <button
                            type="button"
                            disabled={!editable}
                            onClick={() => {
                              const next: Json[] = rows.map((old, rowIndex) =>
                                rowIndex === index
                                  ? { ...item, children: [...children, { label: '', href: '' }] }
                                  : (old as Json),
                              );
                              commit(name, property, next);
                            }}
                          >
                            {t('inspector.generated.addChild')}
                          </button>
                        </fieldset>
                        <button
                          type="button"
                          disabled={!editable}
                          onClick={() => {
                            commit(name, property, rows.filter((_, rowIndex) => rowIndex !== index) as Json);
                          }}
                        >
                          {t('inspector.generated.remove')}
                        </button>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    disabled={!editable}
                    onClick={() => {
                      commit(name, property, [...rows, { label: '', href: '' }] as Json);
                    }}
                  >
                    {t('inspector.generated.add')}
                  </button>
                </fieldset>
              );
            }
            const multiline =
              control === 'textarea' ||
              control === 'rich-text' ||
              control === 'rich-text-toolbar' ||
              control === 'json-editor';
            const type = control === 'range' ? 'range' : control === 'number' ? 'number' : 'text';
            const Component = multiline ? 'textarea' : 'input';
            const isLink = control === 'link' || control === 'link-picker';
            const isAssetRef = property['type'] === 'asset-ref' || control === 'media-picker';
            const inputValue = control === 'class-picker' && Array.isArray(value) ? value.join(' ') : read(value);
            const validUrl = !isLink || read(value) === '' || isSafeUrl(read(value));
            const validAsset = !isAssetRef || read(value) === '' || /^asset:[a-zA-Z0-9_-]{1,64}$/.test(read(value));
            return (
              <div className="blx-inspector-field" key={name}>
                <label htmlFor={id}>{label}</label>
                <Component
                  {...common}
                  type={Component === 'input' ? type : undefined}
                  value={inputValue}
                  min={typeof property['minimum'] === 'number' ? property['minimum'] : undefined}
                  max={typeof property['maximum'] === 'number' ? property['maximum'] : undefined}
                  aria-invalid={!validUrl || !validAsset}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    if (control === 'json-editor') {
                      try {
                        commit(name, property, JSON.parse(next) as Json);
                      } catch {
                        /* keep invalid drafts out of document state */
                      }
                      return;
                    }
                    if (isLink && next !== '' && !isSafeUrl(next)) return;
                    if (isAssetRef && next !== '' && !/^asset:[a-zA-Z0-9_-]{1,64}$/.test(next)) return;
                    if (control === 'class-picker') commit(name, property, next.split(/\s+/).filter(Boolean));
                    else commit(name, property, type === 'number' && next !== '' ? Number(next) : next);
                  }}
                />
              </div>
            );
          })}
        </InspectorSection>
      ))}
    </div>
  );
}
