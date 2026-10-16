import { fail, isFiniteWithin, isInt, isStringMax, readExact, succeed, type Parsed } from './guards.ts';
import { BREAKPOINT_PATTERN, CANVAS_ERROR_CODES, ELEMENT_ID_PATTERN, LIMITS, type CanvasErrorCode } from './limits.ts';
import { isSafeCanvasUrl } from './safe-url.ts';

export type PreviewMode = 'light' | 'dark';

/** Parent to canvas. */
export type ParentMessage =
  | { type: 'render'; html: string; css: string; revision: number }
  | { type: 'viewport'; width: number; breakpoint: string }
  | { type: 'mode'; mode: PreviewMode }
  | { type: 'select'; id: string | null }
  | { type: 'hover'; id: string | null }
  | { type: 'scroll-to'; id: string }
  | { type: 'request-rects'; revision: number }
  | { type: 'ping'; n: number }
  | {
      type: 'edit-start';
      id: string;
      prop: string;
      value: unknown;
      editable: true;
      mode: 'inline' | 'single-line';
      locale: string;
      dir: 'ltr' | 'rtl';
      caret?: number;
      focus?: boolean;
    }
  | { type: 'edit-command'; name: string; args?: Record<string, unknown> }
  | { type: 'edit-end'; commit: boolean };

export interface ElementRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Canvas to parent. */
export type CanvasMessage =
  | { type: 'ready' }
  | { type: 'rendered'; revision: number }
  | { type: 'token-colors'; revision?: number; mode: PreviewMode; colors: { id: string; value: string }[] }
  | { type: 'size'; width: number; height: number }
  | { type: 'scroll'; x: number; y: number }
  | { type: 'pick'; id: string | null; shift: boolean; alt: boolean }
  | { type: 'hover'; id: string | null }
  | { type: 'rects'; revision: number; items: ElementRect[] }
  | { type: 'error'; code: CanvasErrorCode }
  | { type: 'pong'; n: number }
  | { type: 'edit-request'; id: string; caret?: number }
  | { type: 'edit-ready'; id: string; prop: string }
  | { type: 'edit-change'; id: string; prop: string; value: unknown }
  | {
      type: 'edit-selection';
      id: string;
      empty: boolean;
      marks: Record<string, unknown>;
      text: string;
      rect?: { x: number; y: number; w: number; h: number };
    }
  | { type: 'edit-ended'; id: string; reason: 'commit' | 'cancel' }
  | { type: 'shortcut'; name: 'save' }
  | { type: 'edit-error'; code: string };

const ID = new RegExp(ELEMENT_ID_PATTERN);
export const isElementId = (value: unknown): value is string => typeof value === 'string' && ID.test(value);

const isNullableId = (value: unknown): value is string | null => value === null || isElementId(value);
const isMode = (value: unknown): value is PreviewMode => value === 'light' || value === 'dark';
const isRevision = (value: unknown): value is number => isInt(value, 0, Number.MAX_SAFE_INTEGER);
const isTokenId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value) && value.length <= 64;
const isResolvedColor = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= 40 &&
  /^(?:#[\da-fA-F]{3}|#[\da-fA-F]{6}(?:[\da-fA-F]{2})?|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)|hsla?\(\s*\d{1,3}(?:deg)?\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\))$/i.test(
    value,
  );
const isProp = (value: unknown): value is string => typeof value === 'string' && /^[a-z][A-Za-z0-9]{0,31}$/.test(value);
const isEditValue = (value: unknown): boolean => {
  if (typeof value === 'string') return value.length <= 20_000;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const record = value as Record<string, unknown>;
    if (
      Object.keys(record).length !== 2 ||
      record['v'] !== 1 ||
      !Array.isArray(record['inline']) ||
      record['inline'].length > 5_000
    )
      return false;
    let chars = 0;
    for (const item of record['inline']) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
      const node = item as Record<string, unknown>;
      if (node['t'] === 'br') {
        if (Object.keys(node).length !== 1) return false;
        continue;
      }
      if (
        node['t'] !== 'text' ||
        typeof node['s'] !== 'string' ||
        node['s'].length === 0 ||
        node['s'].includes('\n') ||
        Object.keys(node).some((k) => !['t', 's', 'm'].includes(k))
      )
        return false;
      chars += node['s'].length;
      if (chars > 20_000) return false;
      if (node['m'] !== undefined && (!Array.isArray(node['m']) || node['m'].length > 8)) return false;
      if (Array.isArray(node['m']) && !node['m'].every(isRichMark)) return false;
    }
    return JSON.stringify(value).length <= 100_000;
  } catch {
    return false;
  }
};
function isRichMark(mark: unknown): boolean {
  if (typeof mark === 'string') return ['strong', 'em', 'u', 's', 'code'].includes(mark);
  if (!mark || typeof mark !== 'object' || Array.isArray(mark) || Object.keys(mark).length !== 1) return false;
  const record = mark as Record<string, unknown>;
  if ('link' in record) {
    const link = record['link'];
    if (!link || typeof link !== 'object' || Array.isArray(link)) return false;
    const fields = link as Record<string, unknown>;
    return (
      Object.keys(fields).every((key) => key === 'href' || key === 'newTab') &&
      typeof fields['href'] === 'string' &&
      fields['href'].length > 0 &&
      fields['href'].length <= 2048 &&
      isSafeCanvasUrl(fields['href']) &&
      (fields['newTab'] === undefined || typeof fields['newTab'] === 'boolean')
    );
  }
  if ('style' in record) {
    const style = record['style'];
    if (!style || typeof style !== 'object' || Array.isArray(style)) return false;
    const fields = style as Record<string, unknown>;
    return (
      Object.keys(fields).length > 0 &&
      Object.keys(fields).every((key) => key === 'color' || key === 'highlight' || key === 'weight') &&
      Object.entries(fields).every(([key, value]) =>
        key === 'weight'
          ? ['normal', 'medium', 'bold'].includes(String(value))
          : value === null ||
            (typeof value === 'string' && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value) && value.length <= 64),
      )
    );
  }
  return false;
}
function validEditMarks(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !['strong', 'em', 'u', 's', 'code', 'link', 'style'].includes(key)))
    return false;
  if (['strong', 'em', 'u', 's', 'code'].some((key) => record[key] !== undefined && typeof record[key] !== 'boolean'))
    return false;
  if (record['link'] !== undefined) {
    const link = record['link'];
    if (!link || typeof link !== 'object' || Array.isArray(link)) return false;
    const fields = link as Record<string, unknown>;
    if (
      Object.keys(fields).some((key) => !['href', 'newTab'].includes(key)) ||
      (fields['href'] !== undefined && (typeof fields['href'] !== 'string' || !isSafeCanvasUrl(fields['href']))) ||
      (fields['newTab'] !== undefined && typeof fields['newTab'] !== 'boolean')
    )
      return false;
  }
  if (record['style'] !== undefined) {
    const style = record['style'];
    if (!style || typeof style !== 'object' || Array.isArray(style)) return false;
    const fields = style as Record<string, unknown>;
    if (
      Object.keys(fields).some((key) => !['color', 'highlight', 'weight'].includes(key)) ||
      Object.entries(fields).some(([key, val]) =>
        key === 'weight'
          ? !['normal', 'medium', 'bold'].includes(String(val))
          : typeof val !== 'string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(val) || val.length > 64,
      )
    )
      return false;
  }
  return true;
}
function validEditCommand(name: string, args: unknown): boolean {
  if (args === undefined) return ['select-all', 'clear-marks', 'clear-link', 'collapse-selection'].includes(name);
  if (!args || typeof args !== 'object' || Array.isArray(args)) return false;
  const record = args as Record<string, unknown>;
  if (name === 'set-text') {
    const text = record['text'];
    if (Object.keys(record).length !== 1 || typeof text !== 'string' || text.length > 20_000) return false;
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      if ((code < 0x20 && code !== 0x0a) || code === 0x7f) return false;
    }
    return true;
  }
  if (name === 'toggle-mark')
    return (
      Object.keys(record).length === 1 &&
      ['bold', 'italic', 'underline', 'strike', 'code'].includes(String(record['mark']))
    );
  if (name === 'set-link')
    return (
      Object.keys(record).every((key) => key === 'href' || key === 'newTab') &&
      typeof record['href'] === 'string' &&
      record['href'].length > 0 &&
      record['href'].length <= 2048 &&
      isSafeCanvasUrl(record['href']) &&
      (record['newTab'] === undefined || typeof record['newTab'] === 'boolean')
    );
  if (name === 'set-style')
    return (
      Object.keys(record).length > 0 &&
      Object.keys(record).every((key) => ['color', 'highlight', 'weight'].includes(key)) &&
      Object.entries(record).every(([key, val]) =>
        key === 'weight'
          ? ['normal', 'medium', 'bold'].includes(String(val))
          : val === null ||
            (typeof val === 'string' && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(val) && val.length <= 64),
      )
    );
  if (name === 'apply-to-all') {
    const wrapped = readExact(record, ['name'], ['args']);
    if (!wrapped || typeof wrapped['name'] !== 'string') return false;
    const nestedName = wrapped['name'];
    return (
      ['toggle-mark', 'set-link', 'clear-link', 'set-style', 'clear-marks'].includes(nestedName) &&
      validEditCommand(nestedName, wrapped['args'])
    );
  }
  return false;
}

export const isViewportWidth = (value: unknown): value is number =>
  isInt(value, LIMITS.viewportWidthMin, LIMITS.viewportWidthMax);
export const isBreakpoint = (value: unknown): value is string =>
  typeof value === 'string' && BREAKPOINT_PATTERN.test(value);

function typeOf(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const descriptor = Object.getOwnPropertyDescriptor(data, 'type');
  return descriptor !== undefined && 'value' in descriptor && typeof descriptor.value === 'string'
    ? descriptor.value
    : null;
}

/** Validates a message the PARENT sent. Never throws and never echoes the payload. */
export function parseParentMessage(data: unknown): Parsed<ParentMessage> {
  try {
    return parseParent(data);
  } catch {
    return fail('malformed'); // a hostile proxy can throw from any trap
  }
}

function parseParent(data: unknown): Parsed<ParentMessage> {
  const type = typeOf(data);
  if (type === null) return fail('malformed');
  switch (type) {
    case 'render': {
      const f = readExact(data, ['type', 'html', 'css', 'revision']);
      if (f === null) return fail('malformed');
      const { html, css, revision } = f;
      if (typeof html === 'string' && html.length > LIMITS.htmlMax) return fail('too-large');
      if (typeof css === 'string' && css.length > LIMITS.cssMax) return fail('too-large');
      if (!isStringMax(html, LIMITS.htmlMax) || !isStringMax(css, LIMITS.cssMax) || !isRevision(revision)) {
        return fail('invalid-field');
      }
      return succeed({ type, html, css, revision });
    }
    case 'viewport': {
      const f = readExact(data, ['type', 'width', 'breakpoint']);
      if (f === null) return fail('malformed');
      if (!isViewportWidth(f['width']) || !isBreakpoint(f['breakpoint'])) return fail('invalid-field');
      return succeed({ type, width: f['width'], breakpoint: f['breakpoint'] });
    }
    case 'mode': {
      const f = readExact(data, ['type', 'mode']);
      if (f === null) return fail('malformed');
      return isMode(f['mode']) ? succeed({ type, mode: f['mode'] }) : fail('invalid-field');
    }
    case 'select':
    case 'hover': {
      const f = readExact(data, ['type', 'id']);
      if (f === null) return fail('malformed');
      return isNullableId(f['id']) ? succeed({ type, id: f['id'] }) : fail('invalid-field');
    }
    case 'scroll-to': {
      const f = readExact(data, ['type', 'id']);
      if (f === null) return fail('malformed');
      return isElementId(f['id']) ? succeed({ type, id: f['id'] }) : fail('invalid-field');
    }
    case 'request-rects': {
      const f = readExact(data, ['type', 'revision']);
      if (f === null) return fail('malformed');
      return isRevision(f['revision']) ? succeed({ type, revision: f['revision'] }) : fail('invalid-field');
    }
    case 'ping': {
      const f = readExact(data, ['type', 'n']);
      if (f === null) return fail('malformed');
      return isInt(f['n'], 0, Number.MAX_SAFE_INTEGER) ? succeed({ type, n: f['n'] }) : fail('invalid-field');
    }
    case 'edit-start': {
      const f = readExact(
        data,
        ['type', 'id', 'prop', 'value', 'editable', 'mode', 'locale', 'dir'],
        ['caret', 'focus'],
      );
      if (f === null) return fail('malformed');
      if (
        !isElementId(f['id']) ||
        !isProp(f['prop']) ||
        !isEditValue(f['value']) ||
        f['editable'] !== true ||
        !['inline', 'single-line'].includes(String(f['mode'])) ||
        typeof f['locale'] !== 'string' ||
        f['locale'].length > 64 ||
        !['ltr', 'rtl'].includes(String(f['dir'])) ||
        (f['caret'] !== undefined && !isInt(f['caret'], 0, 20_000)) ||
        (f['focus'] !== undefined && typeof f['focus'] !== 'boolean')
      )
        return fail('invalid-field');
      return succeed({
        type,
        id: f['id'],
        prop: f['prop'],
        value: f['value'],
        editable: true,
        mode: f['mode'] as 'inline' | 'single-line',
        locale: f['locale'],
        dir: f['dir'] as 'ltr' | 'rtl',
        ...(f['caret'] === undefined ? {} : { caret: f['caret'] }),
        ...(f['focus'] === undefined ? {} : { focus: f['focus'] }),
      });
    }
    case 'edit-command': {
      const f = readExact(data, ['type', 'name'], ['args']);
      if (
        f === null ||
        typeof f['name'] !== 'string' ||
        ![
          'toggle-mark',
          'set-link',
          'clear-link',
          'set-style',
          'clear-marks',
          'select-all',
          'collapse-selection',
          'apply-to-all',
          'set-text',
        ].includes(f['name'])
      )
        return fail('malformed');
      if (!validEditCommand(f['name'], f['args'])) return fail('invalid-field');
      return succeed({
        type,
        name: f['name'],
        ...(f['args'] === undefined ? {} : { args: f['args'] as Record<string, unknown> }),
      });
    }
    case 'edit-end': {
      const f = readExact(data, ['type', 'commit']);
      return f === null
        ? fail('malformed')
        : typeof f['commit'] === 'boolean'
          ? succeed({ type, commit: f['commit'] })
          : fail('invalid-field');
    }
    default:
      return fail('unknown-type');
  }
}

const isErrorCode = (value: unknown): value is CanvasErrorCode =>
  typeof value === 'string' && (CANVAS_ERROR_CODES as readonly string[]).includes(value);

function parseRect(value: unknown): ElementRect | null {
  const f = readExact(value, ['id', 'x', 'y', 'w', 'h']);
  if (f === null) return null;
  const { id, x, y, w, h } = f;
  if (!isElementId(id)) return null;
  if (!isFiniteWithin(x, LIMITS.coordinateMax) || !isFiniteWithin(y, LIMITS.coordinateMax)) return null;
  if (!isFiniteWithin(w, LIMITS.coordinateMax) || !isFiniteWithin(h, LIMITS.coordinateMax)) return null;
  if (w < 0 || h < 0) return null;
  return { id, x, y, w, h };
}

/** Validates a message the CANVAS sent. Never throws and never echoes the payload. */
export function parseCanvasMessage(data: unknown): Parsed<CanvasMessage> {
  try {
    return parseCanvas(data);
  } catch {
    return fail('malformed');
  }
}

function parseCanvas(data: unknown): Parsed<CanvasMessage> {
  const type = typeOf(data);
  if (type === null) return fail('malformed');
  switch (type) {
    case 'ready': {
      return readExact(data, ['type']) === null ? fail('malformed') : succeed({ type });
    }
    case 'rendered': {
      const f = readExact(data, ['type', 'revision']);
      if (f === null) return fail('malformed');
      return isRevision(f['revision']) ? succeed({ type, revision: f['revision'] }) : fail('invalid-field');
    }
    case 'token-colors': {
      const f = readExact(data, ['type', 'mode', 'colors'], ['revision']);
      if (f === null || !isMode(f['mode']) || !Array.isArray(f['colors'])) return fail('malformed');
      if (f['colors'].length > 64) return fail('too-large');
      if (f['revision'] !== undefined && !isRevision(f['revision'])) return fail('invalid-field');
      const colors: { id: string; value: string }[] = [];
      for (const item of f['colors']) {
        const entry = readExact(item, ['id', 'value']);
        if (entry === null || !isTokenId(entry['id']) || !isResolvedColor(entry['value'])) return fail('invalid-field');
        colors.push({ id: entry['id'], value: entry['value'] });
      }
      return succeed({
        type,
        mode: f['mode'],
        colors,
        ...(f['revision'] === undefined ? {} : { revision: f['revision'] }),
      });
    }
    case 'size': {
      const f = readExact(data, ['type', 'width', 'height']);
      if (f === null) return fail('malformed');
      if (!isInt(f['width'], 1, LIMITS.sizeMax) || !isInt(f['height'], 1, LIMITS.sizeMax)) return fail('invalid-field');
      return succeed({ type, width: f['width'], height: f['height'] });
    }
    case 'scroll': {
      const f = readExact(data, ['type', 'x', 'y']);
      if (f === null) return fail('malformed');
      if (!isFiniteWithin(f['x'], LIMITS.coordinateMax) || !isFiniteWithin(f['y'], LIMITS.coordinateMax))
        return fail('invalid-field');
      return succeed({ type, x: f['x'], y: f['y'] });
    }
    case 'pick': {
      const f = readExact(data, ['type', 'id', 'shift', 'alt']);
      if (f === null) return fail('malformed');
      const { id, shift, alt } = f;
      if (!isNullableId(id) || typeof shift !== 'boolean' || typeof alt !== 'boolean') return fail('invalid-field');
      return succeed({ type, id, shift, alt });
    }
    case 'hover': {
      const f = readExact(data, ['type', 'id']);
      if (f === null) return fail('malformed');
      return isNullableId(f['id']) ? succeed({ type, id: f['id'] }) : fail('invalid-field');
    }
    case 'rects': {
      const f = readExact(data, ['type', 'revision', 'items']);
      if (f === null) return fail('malformed');
      const { revision, items } = f;
      if (!Array.isArray(items)) return fail('invalid-field');
      if (items.length > LIMITS.rectsMax) return fail('too-large');
      if (!isRevision(revision)) return fail('invalid-field');
      const parsed: ElementRect[] = [];
      for (let index = 0; index < items.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(items, index);
        if (descriptor === undefined || !('value' in descriptor)) return fail('invalid-field');
        const rect = parseRect(descriptor.value);
        if (rect === null) return fail('invalid-field');
        parsed.push(rect);
      }
      return succeed({ type, revision, items: parsed });
    }
    case 'error': {
      const f = readExact(data, ['type', 'code']);
      if (f === null) return fail('malformed');
      return isErrorCode(f['code']) ? succeed({ type, code: f['code'] }) : fail('invalid-field');
    }
    case 'pong': {
      const f = readExact(data, ['type', 'n']);
      if (f === null) return fail('malformed');
      return isInt(f['n'], 0, Number.MAX_SAFE_INTEGER) ? succeed({ type, n: f['n'] }) : fail('invalid-field');
    }
    case 'edit-request': {
      const f = readExact(data, ['type', 'id'], ['caret']);
      return f === null
        ? fail('malformed')
        : isElementId(f['id'])
          ? f['caret'] === undefined || isInt(f['caret'], 0, 20_000)
            ? succeed({ type, id: f['id'], ...(f['caret'] === undefined ? {} : { caret: f['caret'] }) })
            : fail('invalid-field')
          : fail('invalid-field');
    }
    case 'edit-ready': {
      const f = readExact(data, ['type', 'id', 'prop']);
      return f === null
        ? fail('malformed')
        : isElementId(f['id']) && isProp(f['prop'])
          ? succeed({ type, id: f['id'], prop: f['prop'] })
          : fail('invalid-field');
    }
    case 'edit-change': {
      const f = readExact(data, ['type', 'id', 'prop', 'value']);
      return f === null
        ? fail('malformed')
        : !isElementId(f['id']) || !isProp(f['prop'])
          ? fail('invalid-field')
          : !isEditValue(f['value'])
            ? fail('too-large')
            : succeed({ type, id: f['id'], prop: f['prop'], value: f['value'] });
    }
    case 'edit-selection': {
      const f = readExact(data, ['type', 'id', 'empty', 'marks', 'text', 'rect']);
      if (f === null) return fail('malformed');
      if (
        !isElementId(f['id']) ||
        typeof f['empty'] !== 'boolean' ||
        !validEditMarks(f['marks']) ||
        !isStringMax(f['text'], 200)
      )
        return fail('invalid-field');
      const rect = f['rect'];
      if (rect !== undefined) {
        const r = readExact(rect, ['x', 'y', 'w', 'h']);
        if (
          r === null ||
          ![r['x'], r['y'], r['w'], r['h']].every((v) => isFiniteWithin(v, LIMITS.coordinateMax)) ||
          Number(r['w']) < 0 ||
          Number(r['h']) < 0
        )
          return fail('invalid-field');
      }
      return succeed({
        type,
        id: f['id'],
        empty: f['empty'],
        marks: f['marks'],
        text: f['text'],
        ...(rect === undefined ? {} : { rect: rect as { x: number; y: number; w: number; h: number } }),
      });
    }
    case 'edit-ended': {
      const f = readExact(data, ['type', 'id', 'reason']);
      return f === null
        ? fail('malformed')
        : isElementId(f['id']) && ['commit', 'cancel'].includes(String(f['reason']))
          ? succeed({ type, id: f['id'], reason: f['reason'] as 'commit' | 'cancel' })
          : fail('invalid-field');
    }
    case 'shortcut': {
      const f = readExact(data, ['type', 'name']);
      return f === null || typeof f['name'] !== 'string' || f['name'].length > LIMITS.shortcutNameMax
        ? fail('malformed')
        : f['name'] === 'save'
          ? succeed({ type, name: 'save' })
          : fail('invalid-field');
    }
    case 'edit-error': {
      const f = readExact(data, ['type', 'code']);
      return f === null
        ? fail('malformed')
        : typeof f['code'] === 'string' && /^[a-z-]{1,40}$/.test(f['code'])
          ? succeed({ type, code: f['code'] })
          : fail('invalid-field');
    }
    default:
      return fail('unknown-type');
  }
}
