import { useRef, useState, type ReactNode } from 'react';
import type { ElementNode } from '@blixis/wp-core';
import { PROPERTIES, validateDeclaration } from '@blixis/wp-style-engine';
import { useEditorStoreApi } from '../../state';
import { useI18n } from '../../i18n-react';
import { styleSelector } from '../style-mapping';
import {
  BOX_SIDES,
  BOX_UNITS,
  boxProperty,
  boxSideValue,
  boxStep,
  formatBoxValue,
  parseBoxValue,
  resetBoxSide,
  setLinkedBoxSides,
  type BoxLayer,
  type BoxSide,
  type BoxUnit,
} from '../box-model';
import type { BreakpointRegistry } from '../../state/context';

const LAYERS: readonly BoxLayer[] = ['margin', 'border', 'padding'];
const BOX_DECLARATIONS = new Set([
  'margin',
  'padding',
  'border-width',
  ...LAYERS.filter((layer) => layer !== 'border').flatMap((layer) => BOX_SIDES.map((side) => boxProperty(layer, side))),
]);

export function BoxModelControl({
  element,
  breakpoint,
  breakpoints,
  editable,
}: {
  element: ElementNode;
  breakpoint: string;
  breakpoints: BreakpointRegistry;
  editable: boolean;
}) {
  const { t } = useI18n();
  const store = useEditorStoreApi();
  const [linked, setLinked] = useState<Record<BoxLayer, boolean>>({ margin: false, border: false, padding: false });
  const [focused, setFocused] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [unitsBySide, setUnitsBySide] = useState<Record<string, BoxUnit>>({});
  const [error, setError] = useState('');
  const cancelled = useRef(new Set<string>());
  const altLinked = useRef(new Set<string>());
  const definition = store.getState().registry.get(element.type);
  const allowed = (property: string, capability: string) =>
    definition?.styleProperties.includes(capability) === true && PROPERTIES.has(property);
  const rules = element.style ?? [];
  const rawOwn =
    rules.find((rule) => (rule.breakpoint ?? 'base') === breakpoint && !rule.mode && !rule.state)?.declarations ?? {};
  const own: Record<string, string> = Object.fromEntries(
    Object.entries(rawOwn).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
  const order = [...new Set(Object.values(breakpoints.viewports).map(({ breakpoint: id }) => id))];
  const index = order.indexOf(breakpoint);
  const previous = order.slice(0, Math.max(0, index)).reverse();
  const rawInherited =
    previous
      .map((id) => rules.find((rule) => (rule.breakpoint ?? 'base') === id && !rule.mode && !rule.state)?.declarations)
      .find(
        (declarations) =>
          declarations !== undefined && Object.keys(declarations).some((key) => BOX_DECLARATIONS.has(key)),
      ) ?? {};
  const inherited: Record<string, string> = Object.fromEntries(
    Object.entries(rawInherited).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
  const sideSupported = (layer: BoxLayer, side: BoxSide) =>
    layer === 'border' ? allowed('border-width', 'border-width') : allowed(boxProperty(layer, side), layer);
  const hasLayer = (layer: BoxLayer) =>
    layer === 'border' ? allowed('border-width', 'border-width') : BOX_SIDES.some((side) => sideSupported(layer, side));
  const send = (layer: BoxLayer, side: BoxSide, raw: string | null, coalesce = false): boolean => {
    if (!editable) return false;
    const prop = boxProperty(layer, side);
    if (raw !== null && !validateDeclaration(prop, raw).ok) {
      setError(t('inspector.error.invalid'));
      return false;
    }
    let declarations: Record<string, string> = { ...own };
    if (raw === null) {
      declarations = resetBoxSide(layer, side, declarations);
    } else if (linked[layer] || altLinked.current.has(`${layer}:${side}`)) {
      declarations = setLinkedBoxSides(layer, declarations, raw);
    } else {
      declarations[prop] = raw;
    }
    for (const [key, value] of Object.entries(declarations)) {
      if (!validateDeclaration(key, value).ok) {
        setError(t('inspector.error.invalid'));
        return false;
      }
    }
    const result = store.getState().dispatch(
      {
        type: 'set-style-rule',
        id: element.id,
        selector: styleSelector(breakpoint),
        declarations: Object.keys(declarations).length ? declarations : null,
      },
      {
        coalesceKey: `style:${element.id}:${breakpoint}:box-model:${layer}`,
        ...(coalesce ? { coalesceWindowMs: 30_000 } : {}),
      },
    );
    setError(result.ok ? '' : t('inspector.error.invalid'));
    return result.ok;
  };
  const input = (layer: BoxLayer, side: BoxSide) => {
    const key = `${layer}:${side}`;
    const supported = sideSupported(layer, side);
    const value = boxSideValue(layer, side, own);
    const parsed = parseBoxValue(value);
    const raw = value === 'auto' && layer === 'margin' ? 'auto' : parsed ? String(parsed.number) : '';
    const shown = Object.hasOwn(drafts, key) ? drafts[key] : raw;
    const ariaNumber = Number(shown);
    const isActive = focused === key;
    const isInherited = value === undefined;
    const label =
      layer === 'border'
        ? t('inspector.style.borderWidth')
        : `${t(`inspector.boxModel.${layer}` as never)} ${t(`inspector.side.${side}` as never)}`;
    const id = `box-model-${element.id}-${key}`;
    const units: readonly BoxUnit[] = layer === 'border' ? ['px'] : BOX_UNITS;
    const unit = unitsBySide[key] ?? (parsed?.unit && units.includes(parsed.unit) ? parsed.unit : 'px');
    const commit = (next = shown) => {
      if (next === '') {
        setError('');
        return;
      }
      const formatted = next === 'auto' && layer === 'margin' ? 'auto' : formatBoxValue(Number(next), unit);
      if (send(layer, side, formatted, true)) {
        setDrafts((current) => {
          return Object.fromEntries(Object.entries(current).filter(([draftKey]) => draftKey !== key));
        });
      }
    };
    return (
      <span className={`blx-box-model-value blx-box-model-${layer === 'border' ? 'border-width' : side}`} key={key}>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          role="spinbutton"
          aria-label={label}
          aria-valuenow={shown && shown !== 'auto' && Number.isFinite(ariaNumber) ? ariaNumber : undefined}
          aria-valuetext={
            shown === 'auto'
              ? t('inspector.boxModel.auto')
              : shown
                ? `${shown}${unit}`
                : t('inspector.boxModel.inherited')
          }
          aria-disabled={!editable || !supported}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `box-model-${element.id}-error` : undefined}
          placeholder="—"
          value={supported ? shown : ''}
          readOnly={!supported}
          data-inherited={isInherited ? 'true' : undefined}
          disabled={!editable || !supported}
          onFocus={() => {
            setFocused(key);
            if (!Object.hasOwn(drafts, key)) setDrafts((current) => ({ ...current, [key]: raw }));
          }}
          onClick={(event) => {
            if (event.altKey) altLinked.current.add(key);
          }}
          onChange={(event) => {
            const next = event.currentTarget.value;
            setDrafts((current) => ({ ...current, [key]: next }));
            if (next === 'auto' && layer === 'margin') send(layer, side, 'auto', true);
            else if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(next)) commit(next);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              cancelled.current.add(key);
              setDrafts((current) => {
                return Object.fromEntries(Object.entries(current).filter(([draftKey]) => draftKey !== key));
              });
              event.currentTarget.blur();
            } else if (event.key === 'Backspace' || event.key === 'Delete') {
              if (shown === '') {
                event.preventDefault();
                send(layer, side, null);
              }
            } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault();
              const current = Number(shown ?? '0');
              const delta = boxStep(unit, event.shiftKey, event.altKey) * (event.key === 'ArrowUp' ? 1 : -1);
              const next = String(Math.round((current + delta) * 100) / 100);
              setDrafts((value) => ({ ...value, [key]: next }));
              commit(next);
            }
          }}
          onBlur={(event) => {
            const nextTarget = event.relatedTarget;
            if (nextTarget instanceof HTMLElement && event.currentTarget.parentElement?.contains(nextTarget)) return;
            if (cancelled.current.has(key)) cancelled.current.delete(key);
            else if (shown && shown !== 'auto') commit();
            altLinked.current.delete(key);
            setFocused(null);
          }}
          onPointerDown={(event) => {
            if (event.button !== 0 || !supported) return;
            const target = event.currentTarget;
            const pointerId = event.pointerId;
            const x = event.clientX;
            const start = Number(shown ?? '0');
            target.setPointerCapture(pointerId);
            const move = (next: PointerEvent) => {
              if (!target.hasPointerCapture(next.pointerId)) return;
              const val = String(Math.round((start + (next.clientX - x) * (next.shiftKey ? 10 : 1)) * 100) / 100);
              setDrafts((current) => ({ ...current, [key]: val }));
              commit(val);
            };
            target.addEventListener('pointermove', move);
            target.addEventListener(
              'pointerup',
              () => {
                target.removeEventListener('pointermove', move);
                if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
              },
              { once: true },
            );
          }}
        />
        {isActive && supported ? (
          <>
            {layer !== 'border' ? (
              <select
                aria-label={t('inspector.boxModel.unit', { layer: t(`inspector.boxModel.${layer}` as never) })}
                value={unit}
                onChange={(event) => {
                  const next = event.currentTarget.value as BoxUnit;
                  const prior = Number(shown ?? '0');
                  setUnitsBySide((current) => ({ ...current, [key]: next }));
                  setDrafts((current) => ({ ...current, [key]: String(prior) }));
                  if (raw) send(layer, side, formatBoxValue(prior, next), true);
                }}
              >
                {units.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            ) : null}
            {value !== undefined ? (
              <button
                type="button"
                aria-label={t('inspector.boxModel.reset', {
                  side: t(`inspector.side.${side}` as never),
                  layer: t(`inspector.boxModel.${layer}` as never),
                })}
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => {
                  send(layer, side, null);
                }}
              >
                ↶
              </button>
            ) : null}
          </>
        ) : null}
      </span>
    );
  };
  const overridden =
    breakpoint !== 'base' &&
    Object.keys(own).some(
      (key) =>
        /^(margin|padding)(-(block-start|inline-end|block-end|inline-start))?$/.test(key) || key === 'border-width',
    );
  const hasInherited = Object.keys(inherited).some((key) => /^(margin|padding)(-|$)|^border-width$/.test(key));
  let diagramContents: ReactNode = (
    <div className="blx-box-model-content" aria-hidden="true">
      <span>{`${own['width'] ?? inherited['width'] ?? t('inspector.boxModel.auto')} × ${own['height'] ?? inherited['height'] ?? t('inspector.boxModel.auto')}`}</span>
    </div>
  );
  for (const layer of [...LAYERS].reverse()) {
    if (!hasLayer(layer)) continue;
    diagramContents = (
      <div
        className={`blx-box-model-layer blx-box-model-layer-${layer}`}
        key={layer}
        role="group"
        aria-labelledby={`box-model-${layer}-label`}
      >
        <span className="blx-box-model-surface" aria-hidden="true" />
        <span className="blx-box-model-caption" id={`box-model-${layer}-label`}>
          {t(`inspector.boxModel.${layer}` as never)}
        </span>
        {layer === 'border' ? input('border', 'block-start') : BOX_SIDES.map((side) => input(layer, side))}
        {diagramContents}
      </div>
    );
  }
  return (
    <div className="blx-box-model-wrap">
      <div className="blx-box-model-diagram" role="group" aria-label={t('inspector.boxModel.label')}>
        {diagramContents}
      </div>
      {breakpoint !== 'base' ? (
        <p className="blx-override">
          {overridden ? t('inspector.overridden') : hasInherited ? t('inspector.inherited') : ''}
        </p>
      ) : null}
      <div className="blx-box-model-controls">
        {LAYERS.filter((layer) => layer !== 'border' && hasLayer(layer)).map((layer) => (
          <button
            key={layer}
            type="button"
            aria-label={t('inspector.spacing.link', { field: t(`inspector.boxModel.${layer}` as never) })}
            aria-pressed={linked[layer]}
            disabled={!editable}
            onClick={() => {
              setLinked((current) => ({ ...current, [layer]: !current[layer] }));
            }}
          >
            ↔ {t(`inspector.boxModel.${layer}` as never)}
          </button>
        ))}
      </div>
      {error ? (
        <p id={`box-model-${element.id}-error`} role="alert" className="blx-inspector-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
