import { useState } from 'react';
import type { ElementNode } from '@blixis/wp-core';
import { validateDeclaration } from '@blixis/wp-style-engine';
import { useEditorStoreApi } from '../../state';
import { useI18n } from '../../i18n-react';
import { Icon, NumberWithUnit, Slider } from '@blixis/wp-editor-ui';
import { humanizeTokenName, shouldUseSelect, styleSelector, type StyleField } from '../style-mapping';
import type { BreakpointRegistry } from '../../state/context';
import { clampSliderDisplay, convertStyleUnit, styleSliderRange } from './style-slider';
import type { TEXT_ALIGNMENT_ICON_MAP } from '../style-mapping';

function TextAlignGlyph({ align }: { align: keyof typeof TEXT_ALIGNMENT_ICON_MAP }) {
  const lineSet: Readonly<Record<typeof align, readonly [number, number][]>> = {
    left: [
      [3, 18],
      [3, 14],
      [3, 20],
    ],
    center: [
      [5, 19],
      [3, 21],
      [6, 18],
    ],
    right: [
      [6, 21],
      [10, 21],
      [4, 21],
    ],
    justify: [
      [3, 21],
      [3, 21],
      [3, 21],
    ],
  };
  return (
    <svg
      className="blx-text-align-glyph"
      data-align={align}
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="16"
      height="16"
    >
      {lineSet[align].map(([start, end], index) => (
        <path key={index} d={`M${String(start)} ${String(6 + index * 6)}H${String(end)}`} />
      ))}
    </svg>
  );
}

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
  'font-family': ['var(--blx-font-body)', 'var(--blx-font-heading)'],
  'font-weight': ['400', '500', '600', '700'],
  'line-height': ['1.2', '1.5', '1.6'],
  'letter-spacing': ['-0.5px', '0px', '0.5px'],
  'border-color': ['var(--blx-color-text)', 'var(--blx-color-primary)', 'var(--blx-color-link)'],
  'border-width': ['0px', '1px', '2px', '4px'],
  'border-radius': ['0px', '4px', '8px', '12px', '999px'],
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
  viewport,
  editable,
}: {
  element: ElementNode;
  field: StyleField;
  breakpoint: string;
  breakpoints: BreakpointRegistry;
  viewport: 'desktop' | 'tablet' | 'mobile';
  editable: boolean;
}) {
  const { t, locale } = useI18n();
  const store = useEditorStoreApi();
  const [error, setError] = useState('');
  const [linkedSides, setLinkedSides] = useState(false);
  const [customWidth, setCustomWidth] = useState(false);
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
  const displayToken = (token: string) => {
    const known = tokenLabels[token];
    if (known) return t(known as never);
    const name = token
      .replace(/^var\(--/, '')
      .replace(/\)$/, '')
      .replace(/^blx-/, '');
    const key = `inspector.token.${name.replace(/-/g, '.')}`;
    const translated = t(key as never);
    return translated === key ? humanizeTokenName(name, locale === 'nl_NL' ? 'nl_NL' : 'en_US') : translated;
  };
  const selectedCustomWidth =
    customWidth || (field.id === 'width' && typeof value === 'string' && !['auto', '100%'].includes(value));
  const nextViewport = viewport === 'desktop' ? 'tablet' : viewport === 'tablet' ? 'mobile' : 'desktop';
  const update = (next: string | null, coalesceWindowMs?: number) => {
    const declarations =
      next === null
        ? Object.fromEntries(Object.entries(own).filter(([key]) => !declarationKeys.includes(key)))
        : { ...own, [field.id]: next };
    const checked = next === null ? null : validateDeclaration(field.id, next);
    if (checked !== null && !checked.ok) {
      setError(t('inspector.error.invalid'));
      return;
    }
    const result = store.getState().dispatch(
      {
        type: 'set-style-rule',
        id: element.id,
        selector: styleSelector(breakpoint),
        declarations: Object.keys(declarations).length ? declarations : null,
      },
      {
        coalesceKey: `style:${element.id}:${breakpoint}:${field.id}`,
        ...(coalesceWindowMs === undefined ? {} : { coalesceWindowMs }),
      },
    );
    setError(result.ok ? '' : t('inspector.error.invalid'));
  };
  const tokenFontSizes: Record<string, number> = {
    'var(--blx-text-sm)': 14,
    'var(--blx-text-base)': 16,
    'var(--blx-text-lg)': 18,
    'var(--blx-text-xl)': 20,
    'var(--blx-text-2xl)': 24,
  };
  const selectValues: Readonly<Record<string, readonly string[]>> = {
    'font-weight': ['400', '500', '600', '700'],
    'text-transform': ['capitalize', 'uppercase', 'lowercase', 'none'],
    'text-align': ['left', 'center', 'right', 'justify'],
    width: ['auto', '100%', 'custom'],
    display: ['block', 'inline', 'inline-block'],
    'border-style': ['none', 'solid', 'dashed', 'dotted'],
    'box-shadow': ['none', 'var(--blx-shadow-card)'],
  };
  const choiceLabel = (choice: string) => {
    if (choice.startsWith('var(--')) {
      return displayToken(choice);
    }
    if (field.id === 'text-align') return t(`inspector.choice.align.${choice}` as never);
    const key = `inspector.choice.${choice.replace(/[^a-z0-9]+/gi, '.').replace(/^\.|\.$/g, '')}`;
    return t(key as never);
  };
  const choices = selectValues[field.id] ?? [];
  const useNativeSelect = shouldUseSelect(
    field.id === 'text-align' ? ['Left', 'Center', 'Right', 'Justify'] : choices.map(choiceLabel),
  );
  const sliderUnits: Readonly<Record<string, readonly string[]>> = {
    'font-size': ['px', 'rem', 'em', '%'],
    'line-height': [''],
    'letter-spacing': ['px', 'em', 'rem'],
    'border-radius': ['px', 'rem', '%'],
    'border-width': ['px'],
  };
  const units = sliderUnits[field.id];
  const rawNumber = typeof value === 'string' ? (tokenFontSizes[value] ?? Number.parseFloat(value)) : Number.NaN;
  const numberValue = Number.isFinite(rawNumber)
    ? rawNumber
    : field.id === 'font-size'
      ? 16
      : field.id === 'line-height'
        ? 1.5
        : 0;
  const defaultUnit = field.id === 'line-height' ? '' : 'px';
  const parsedUnit = typeof value === 'string' ? /(-?(?:\d+\.?\d*|\.\d+))([a-z%]*)$/i.exec(value)?.[2] : undefined;
  const currentUnit = parsedUnit && units?.includes(parsedUnit) ? parsedUnit : defaultUnit;
  const slider = units ? styleSliderRange(field.id, currentUnit) : undefined;
  const control =
    slider !== undefined ? (
      <div className="blx-slider-field">
        <Slider
          value={clampSliderDisplay(numberValue, slider.min, slider.max)}
          min={slider.min}
          max={slider.max}
          step={slider.step}
          label={fieldLabel}
          disabled={!editable}
          describedBy={describedBy}
          onValueChange={(next) => {
            update(`${String(Number(next.toFixed(2)))}${currentUnit}`, 30_000);
          }}
          onValueCommit={() => {
            store.getState().finishCoalescing();
          }}
        />
        <NumberWithUnit
          id={id}
          label={fieldLabel}
          value={numberValue}
          unit={currentUnit}
          units={units ?? []}
          min={slider.min}
          max={slider.max}
          step={slider.step}
          disabled={!editable}
          describedBy={describedBy}
          onValueChange={(next, unit) => {
            const valueInUnit = unit === currentUnit ? next : convertStyleUnit(numberValue, currentUnit, unit);
            const converted = clampSliderDisplay(
              valueInUnit,
              styleSliderRange(field.id, unit)?.min ?? slider.min,
              styleSliderRange(field.id, unit)?.max ?? slider.max,
            );
            update(`${String(converted)}${unit}`);
          }}
          onInvalid={() => {
            setError(t('inspector.error.invalid'));
          }}
        />
      </div>
    ) : ['color', 'background-color', 'border-color'].includes(field.id) ? (
      <div className="blx-color-field">
        <span
          aria-hidden="true"
          className="blx-color-swatch"
          style={{ backgroundColor: typeof value === 'string' ? value : 'transparent' }}
        />
        <select
          id={id}
          aria-label={fieldLabel}
          aria-describedby={describedBy}
          disabled={!editable}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => {
            update(event.target.value || null);
          }}
        >
          <option value="">{t('inspector.inherit')}</option>
          {(field.id === 'border-color' ? (TYPOGRAPHY_PRESETS['border-color'] ?? []) : STYLE_TOKENS.slice(6, 11)).map(
            (token) => (
              <option key={token} value={token}>
                {displayToken(token)}
              </option>
            ),
          )}
        </select>
      </div>
    ) : field.kind === 'select' && useNativeSelect ? (
      <select
        id={id}
        aria-label={fieldLabel}
        aria-describedby={describedBy}
        value={field.id === 'width' && selectedCustomWidth ? 'custom' : (value ?? choices[0] ?? '')}
        disabled={!editable}
        onChange={(event) => {
          const choice = event.target.value;
          if (field.id === 'width' && choice === 'custom') setCustomWidth(true);
          else {
            setCustomWidth(false);
            update(choice);
          }
        }}
      >
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {choiceLabel(choice)}
          </option>
        ))}
      </select>
    ) : field.kind === 'select' ? (
      <div id={id} className="blx-segmented" role="radiogroup" aria-label={fieldLabel} aria-describedby={describedBy}>
        {(selectValues[field.id] ?? []).map((choice, index) => (
          <button
            key={choice}
            type="button"
            role="radio"
            aria-checked={
              field.id === 'width' && choice === 'custom'
                ? selectedCustomWidth
                : value === choice || (value === undefined && index === 0)
            }
            tabIndex={
              field.id === 'width' && choice === 'custom'
                ? selectedCustomWidth
                  ? 0
                  : -1
                : value === choice || (value === undefined && index === 0)
                  ? 0
                  : -1
            }
            aria-label={choiceLabel(choice)}
            data-choice={choice}
            className={
              field.id === 'width' && choice === 'custom'
                ? selectedCustomWidth
                  ? 'is-active'
                  : undefined
                : value === choice || (value === undefined && index === 0)
                  ? 'is-active'
                  : undefined
            }
            disabled={!editable}
            onClick={() => {
              if (field.id === 'width' && choice === 'custom') setCustomWidth(true);
              else {
                setCustomWidth(false);
                update(choice);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                event.preventDefault();
                const values = selectValues[field.id] ?? [];
                const nextIndex = (index + (event.key === 'ArrowRight' ? 1 : -1) + values.length) % values.length;
                const next = values[nextIndex];
                if (next) {
                  if (field.id === 'width' && next === 'custom') setCustomWidth(true);
                  else {
                    setCustomWidth(false);
                    update(next);
                  }
                  event.currentTarget.parentElement
                    ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
                    [nextIndex]?.focus();
                }
              }
            }}
          >
            {choice === 'custom' ? (
              t('inspector.option.custom')
            ) : choice === '100%' ? (
              t('inspector.option.full')
            ) : field.id === 'text-transform' ? (
              choiceLabel(choice)
            ) : field.id === 'text-align' ? (
              <TextAlignGlyph align={choice as keyof typeof TEXT_ALIGNMENT_ICON_MAP} />
            ) : (
              choiceLabel(choice)
            )}
          </button>
        ))}
        {field.id === 'width' && selectedCustomWidth ? (
          <NumberWithUnit
            id={`${id}-custom`}
            label={t('inspector.style.width')}
            value={typeof value === 'string' ? Number.parseFloat(value) || 960 : 960}
            unit={typeof value === 'string' ? (/([a-z%]+)$/i.exec(value)?.[1] ?? 'px') : 'px'}
            units={['px', 'rem', '%', 'vw']}
            min={1}
            max={5000}
            disabled={!editable}
            onValueChange={(next, unit) => {
              update(`${String(next)}${unit}`);
            }}
            onInvalid={() => {
              setError(t('inspector.error.invalid'));
            }}
          />
        ) : null}
      </div>
    ) : field.kind === 'spacing' ? (
      <fieldset className="blx-spacing">
        <legend>{t(field.key)}</legend>
        <div className="blx-spacing-heading">
          <span>{fieldLabel}</span>
          <button
            type="button"
            className={`blx-spacing-link${linkedSides ? ' is-active' : ''}`}
            aria-label={t('inspector.spacing.link', { field: fieldLabel })}
            aria-pressed={linkedSides}
            onClick={() => {
              setLinkedSides((linked) => !linked);
            }}
          >
            <Icon name="link" size={14} />
          </button>
        </div>
        <div className="blx-spacing-sides">
          {SIDES.map((side) => {
            const key = `${field.id}-${side}`;
            const sideValue = own[key] ?? own[field.id];
            const sideId = `${id}-${side}`;
            const match = typeof sideValue === 'string' ? /^(-?(?:\d+\.?\d*|\.\d+))([a-z%]*)$/i.exec(sideValue) : null;
            const numeric = match ? Number(match[1]) : 0;
            const unit = match?.[2] && ['px', 'em', 'rem', '%', 'vw', 'vh'].includes(match[2]) ? match[2] : 'px';
            return (
              <div key={side}>
                <NumberWithUnit
                  id={sideId}
                  label={t(`inspector.side.${side}` as never)}
                  value={numeric}
                  unit={unit}
                  units={['px', 'rem', 'em', '%', 'vw', 'vh']}
                  min={field.id === 'margin' ? -500 : 0}
                  max={2000}
                  disabled={!editable}
                  describedBy={describedBy}
                  onValueChange={(next, nextUnit) => {
                    const valueText = `${String(next)}${nextUnit}`;
                    const keys = linkedSides ? SIDES.map((item) => `${field.id}-${item}`) : [key];
                    const declarations = { ...own };
                    for (const declarationKey of keys) declarations[declarationKey] = valueText;
                    const invalid = keys.some((declarationKey) => !validateDeclaration(declarationKey, valueText).ok);
                    if (invalid) {
                      setError(t('inspector.error.invalid'));
                      return;
                    }
                    const result = store.getState().dispatch(
                      {
                        type: 'set-style-rule',
                        id: element.id,
                        selector: styleSelector(breakpoint),
                        declarations,
                      },
                      { coalesceKey: `style:${element.id}:${breakpoint}:${field.id}` },
                    );
                    setError(result.ok ? '' : t('inspector.error.invalid'));
                  }}
                  onInvalid={() => {
                    setError(t('inspector.error.invalid'));
                  }}
                />
              </div>
            );
          })}
        </div>
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
          selectValues[field.id] ??
          TYPOGRAPHY_PRESETS[field.id] ??
          (field.id.includes('color') ? STYLE_TOKENS.slice(6, 11) : [])
        ).map((token) => (
          <option key={token} value={token}>
            {displayToken(token)}
          </option>
        ))}
      </select>
    );
  return (
    <div className={`blx-inspector-field${field.kind === 'spacing' ? ' blx-spacing-field' : ''}`}>
      <div className="blx-inspector-label">
        {field.kind !== 'spacing' ? <label htmlFor={id}>{fieldLabel}</label> : <span>{fieldLabel}</span>}
        <button
          type="button"
          className="blx-style-viewport"
          data-overridden={overridden ? 'true' : undefined}
          aria-label={t('inspector.viewport.select', {
            viewport: t(`inspector.viewport.${nextViewport}` as never),
            field: fieldLabel,
          })}
          onClick={() => {
            store.getState().setViewport(nextViewport);
          }}
        >
          <Icon name={viewport === 'desktop' ? 'desktop' : viewport} size={14} />
        </button>
      </div>
      <div className="blx-style-control-cluster">{control}</div>
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
