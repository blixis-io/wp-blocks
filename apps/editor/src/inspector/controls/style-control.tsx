import { useState } from 'react';
import type { ElementNode } from '@blixis/wp-core';
import { validateDeclaration } from '@blixis/wp-style-engine';
import { useEditorStoreApi } from '../../state';
import { useI18n } from '../../i18n-react';
import { styleSelector, type StyleField } from '../style-mapping';
import type { BreakpointRegistry } from '../../state/context';

const STYLE_TOKENS = [
  'var(--blx-space-1)',
  'var(--blx-space-2)',
  'var(--blx-space-3)',
  'var(--blx-space-4)',
  'var(--blx-space-6)',
  'var(--blx-space-8)',
  'var(--blx-color-text)',
  'var(--blx-color-surface)',
  'var(--blx-color-primary)',
  'var(--blx-color-link)',
  'var(--blx-color-on-primary)',
  'var(--blx-text-sm)',
  'var(--blx-text-base)',
  'var(--blx-text-lg)',
  'var(--blx-text-xl)',
  'var(--blx-text-2xl)',
];
const TYPOGRAPHY_PRESETS: Readonly<Record<string, readonly string[]>> = {
  'font-weight': ['400', '500', '600', '700'],
  'line-height': ['1.2', '1.5', '1.6'],
};
const SIDES = ['block-start', 'inline-end', 'block-end', 'inline-start'] as const;
const tokenLabels: Readonly<Record<string, string>> = Object.fromEntries(
  STYLE_TOKENS.map((token) => [
    token,
    `inspector.token.${token.replace('var(--blx-', '').replace(')', '').replace(/-/g, '.')}`,
  ]),
);
export function StyleControl({
  element,
  field,
  breakpoint,
  breakpoints,
  editable,
}: {
  element: ElementNode;
  field: StyleField;
  breakpoint: string;
  breakpoints: BreakpointRegistry;
  editable: boolean;
}) {
  const { t } = useI18n();
  const store = useEditorStoreApi();
  const [error, setError] = useState('');
  const rules = element.style ?? [];
  const breakpointOrder = [...new Set(Object.values(breakpoints.viewports).map(({ breakpoint: id }) => id))];
  const currentIndex = breakpointOrder.indexOf(breakpoint);
  const own =
    rules.find(
      (rule) => (rule.breakpoint ?? 'base') === breakpoint && rule.mode === undefined && rule.state === undefined,
    )?.declarations ?? {};
  const value = own[field.id];
  const inheritedBreakpoints = breakpointOrder.slice(0, Math.max(0, currentIndex)).reverse();
  const declarationKeys =
    field.kind === 'spacing' ? [field.id, ...SIDES.map((side) => `${field.id}-${side}`)] : [field.id];
  const inherited = inheritedBreakpoints
    .map(
      (id) =>
        rules.find((rule) => (rule.breakpoint ?? 'base') === id && rule.mode === undefined && rule.state === undefined)
          ?.declarations,
    )
    .find(
      (declarations) => declarations !== undefined && declarationKeys.some((key) => declarations[key] !== undefined),
    );
  const overridden = breakpoint !== 'base' && declarationKeys.some((key) => own[key] !== undefined);
  const id = `style-${element.id}-${field.id}`;
  const statusId = `${id}-status`;
  const errorId = `${id}-error`;
  const describedBy =
    [breakpoint !== 'base' ? statusId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined;
  const fieldLabel = t(field.key);
  const update = (next: string | null) => {
    const declarations =
      next === null
        ? Object.fromEntries(Object.entries(own).filter(([key]) => !declarationKeys.includes(key)))
        : { ...own, [field.id]: next };
    const checked = next === null ? null : validateDeclaration(field.id, next);
    if (checked !== null && !checked.ok) {
      setError(t('inspector.error.invalid'));
      return;
    }
    const result = store.getState().dispatch({
      type: 'set-style-rule',
      id: element.id,
      selector: styleSelector(breakpoint),
      declarations: Object.keys(declarations).length ? declarations : null,
    });
    setError(result.ok ? '' : t('inspector.error.invalid'));
  };
  const control =
    field.kind === 'select' ? (
      <select
        id={id}
        disabled={!editable}
        aria-describedby={describedBy}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => {
          update(e.target.value || null);
        }}
      >
        <option value="">{t('inspector.inherit')}</option>
        {['start', 'center', 'end', 'justify'].map((v) => (
          <option key={v} value={v}>
            {t(`inspector.option.${v}` as never)}
          </option>
        ))}
      </select>
    ) : field.kind === 'spacing' ? (
      <fieldset className="blx-spacing">
        <legend>{t(field.key)}</legend>
        {SIDES.map((side) => {
          const key = `${field.id}-${side}`;
          const sideValue = own[key] ?? own[field.id];
          const sideId = `${id}-${side}`;
          return (
            <div key={side}>
              <label htmlFor={sideId}>{t(`inspector.side.${side}` as never)}</label>
              <select
                id={sideId}
                disabled={!editable}
                aria-describedby={describedBy}
                value={typeof sideValue === 'string' ? sideValue : ''}
                onChange={(e) => {
                  const checked = e.target.value ? validateDeclaration(key, e.target.value) : null;
                  if (checked !== null && !checked.ok) {
                    setError(t('inspector.error.invalid'));
                    return;
                  }
                  const decl = e.target.value
                    ? { ...own, [key]: e.target.value }
                    : Object.fromEntries(Object.entries(own).filter(([existing]) => existing !== key));
                  const result = store.getState().dispatch({
                    type: 'set-style-rule',
                    id: element.id,
                    selector: styleSelector(breakpoint),
                    declarations: Object.keys(decl).length ? decl : null,
                  });
                  setError(result.ok ? '' : t('inspector.error.invalid'));
                }}
              >
                <option value="">{t('inspector.inherit')}</option>
                {STYLE_TOKENS.slice(0, 6).map((token) => (
                  <option key={token} value={token}>
                    {t(tokenLabels[token] as never)}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </fieldset>
    ) : (
      <select
        id={id}
        disabled={!editable}
        aria-describedby={describedBy}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => {
          update(e.target.value || null);
        }}
      >
        <option value="">{t('inspector.inherit')}</option>
        {(
          TYPOGRAPHY_PRESETS[field.id] ??
          (field.id.includes('color')
            ? STYLE_TOKENS.slice(6, 11)
            : field.id === 'font-size'
              ? STYLE_TOKENS.slice(11)
              : [])
        ).map((token) => (
          <option key={token} value={token}>
            {t(tokenLabels[token] as never)}
          </option>
        ))}
      </select>
    );
  return (
    <div className="blx-inspector-field">
      {field.kind !== 'spacing' ? <label htmlFor={id}>{t(field.key)}</label> : null}
      {control}
      {breakpoint !== 'base' ? (
        <div className="blx-override">
          {overridden ? (
            <span id={statusId}>
              {t('inspector.inheritance', { field: fieldLabel, status: t('inspector.overridden') })}
            </span>
          ) : (
            <span id={statusId}>
              {t('inspector.inheritance', {
                field: fieldLabel,
                status: inherited === undefined ? t('inspector.noInherited') : t('inspector.inherited'),
              })}
            </span>
          )}
          {overridden ? (
            <button
              type="button"
              disabled={!editable}
              onClick={() => {
                update(null);
              }}
            >
              {t('inspector.resetField', { field: fieldLabel })}
            </button>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="blx-inspector-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
