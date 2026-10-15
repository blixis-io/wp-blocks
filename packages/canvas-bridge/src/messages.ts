import { fail, isFiniteWithin, isInt, isStringMax, readExact, succeed, type Parsed } from './guards.ts';
import { BREAKPOINT_PATTERN, CANVAS_ERROR_CODES, ELEMENT_ID_PATTERN, LIMITS, type CanvasErrorCode } from './limits.ts';

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
  | { type: 'ping'; n: number };

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
  | { type: 'size'; width: number; height: number }
  | { type: 'pick'; id: string; shift: boolean; alt: boolean }
  | { type: 'hover'; id: string | null }
  | { type: 'rects'; revision: number; items: ElementRect[] }
  | { type: 'error'; code: CanvasErrorCode }
  | { type: 'pong'; n: number };

const ID = new RegExp(ELEMENT_ID_PATTERN);
export const isElementId = (value: unknown): value is string => typeof value === 'string' && ID.test(value);

const isNullableId = (value: unknown): value is string | null => value === null || isElementId(value);
const isMode = (value: unknown): value is PreviewMode => value === 'light' || value === 'dark';
const isRevision = (value: unknown): value is number => isInt(value, 0, Number.MAX_SAFE_INTEGER);

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
    case 'size': {
      const f = readExact(data, ['type', 'width', 'height']);
      if (f === null) return fail('malformed');
      if (!isInt(f['width'], 1, LIMITS.sizeMax) || !isInt(f['height'], 1, LIMITS.sizeMax)) return fail('invalid-field');
      return succeed({ type, width: f['width'], height: f['height'] });
    }
    case 'pick': {
      const f = readExact(data, ['type', 'id', 'shift', 'alt']);
      if (f === null) return fail('malformed');
      const { id, shift, alt } = f;
      if (!isElementId(id) || typeof shift !== 'boolean' || typeof alt !== 'boolean') return fail('invalid-field');
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
    default:
      return fail('unknown-type');
  }
}
