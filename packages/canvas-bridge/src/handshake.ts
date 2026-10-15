import { fail, isStringMax, readExact, succeed, type Parsed } from './guards.ts';
import { HELLO_TYPE, INIT_TYPE, LIMITS, LOCALE_PATTERN, NONCE_PATTERN, PROTOCOL_VERSION } from './limits.ts';
import { isBreakpoint, isViewportWidth, type PreviewMode } from './messages.ts';

export interface Hello {
  type: typeof HELLO_TYPE;
  version: typeof PROTOCOL_VERSION;
  nonce: string;
}

/** What the parent tells the canvas once, with the transferred port. */
export interface InitPayload {
  viewport: { width: number; breakpoint: string };
  mode: PreviewMode;
  locale: string;
  dir: 'ltr' | 'rtl';
}

export interface Init extends InitPayload {
  type: typeof INIT_TYPE;
  version: typeof PROTOCOL_VERSION;
  nonce: string;
}

const isNonce = (value: unknown): value is string => typeof value === 'string' && NONCE_PATTERN.test(value);

export function parseHello(data: unknown): Parsed<Hello> {
  try {
    return helloOf(data);
  } catch {
    return fail('malformed');
  }
}

function helloOf(data: unknown): Parsed<Hello> {
  const f = readExact(data, ['type', 'version', 'nonce']);
  if (f === null) return fail('malformed');
  if (f['type'] !== HELLO_TYPE || f['version'] !== PROTOCOL_VERSION || !isNonce(f['nonce']))
    return fail('invalid-field');
  return succeed({ type: HELLO_TYPE, version: PROTOCOL_VERSION, nonce: f['nonce'] });
}

/** Validates the viewport/mode/locale/dir part; shared by `parseInit` and by the parent when it is configured. */
export function parseInitPayload(data: unknown): Parsed<InitPayload> {
  try {
    return payloadOf(data);
  } catch {
    return fail('malformed');
  }
}

function payloadOf(data: unknown): Parsed<InitPayload> {
  const f = readExact(data, ['viewport', 'mode', 'locale', 'dir']);
  if (f === null) return fail('malformed');
  return validatePayload(f);
}

function validatePayload(f: Readonly<Record<string, unknown>>): Parsed<InitPayload> {
  const viewport = readExact(f['viewport'], ['width', 'breakpoint']);
  if (viewport === null) return fail('malformed');
  const { width, breakpoint } = viewport;
  const { mode, locale, dir } = f;
  if (!isViewportWidth(width) || !isBreakpoint(breakpoint)) return fail('invalid-field');
  if (mode !== 'light' && mode !== 'dark') return fail('invalid-field');
  if (!isStringMax(locale, LIMITS.localeMax) || !LOCALE_PATTERN.test(locale)) return fail('invalid-field');
  if (dir !== 'ltr' && dir !== 'rtl') return fail('invalid-field');
  return succeed({ viewport: { width, breakpoint }, mode, locale, dir });
}

export function parseInit(data: unknown): Parsed<Init> {
  try {
    return initOf(data);
  } catch {
    return fail('malformed');
  }
}

function initOf(data: unknown): Parsed<Init> {
  const f = readExact(data, ['type', 'version', 'nonce', 'viewport', 'mode', 'locale', 'dir']);
  if (f === null) return fail('malformed');
  if (f['type'] !== INIT_TYPE || f['version'] !== PROTOCOL_VERSION || !isNonce(f['nonce']))
    return fail('invalid-field');
  const payload = validatePayload(f);
  if (!payload.ok) return payload;
  return succeed({ type: INIT_TYPE, version: PROTOCOL_VERSION, nonce: f['nonce'], ...payload.value });
}
