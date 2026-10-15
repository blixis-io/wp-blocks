import {
  CURRENT_SCHEMA_VERSION,
  findReservedKeys,
  validateDocument,
  type BuilderDocument,
  type TranslationEntry,
} from '@blixis/wp-core';

/**
 * Turns the server's working streams into the in-memory document and back (ADR 0003 / 0004). The layout stream is the
 * document without `translations`; every locale has its own content stream `{ schemaVersion, contentRevision, locale,
 * entries }` whose `entries` become `translations[locale]`. Everything that comes from the server is untrusted: the
 * composed document passes core's `validateDocument` (limits, reserved keys, shape, semantics) or nothing is loaded.
 */

export type ComposeErrorCode =
  /** A stream is not a JSON object, or the layout carries fields it must not (`translations`). */
  | 'invalid-shape'
  /** The layout stream does not make a valid document. */
  | 'invalid-layout'
  /** A content stream (or its entries) is invalid. */
  | 'invalid-content'
  /** A content stream names another locale than the slot it was read from. */
  | 'locale-mismatch'
  /** The content stream was written for another schema version. */
  | 'unsupported-version'
  /** Invalid arguments from the caller (post id, locales). */
  | 'invalid-input';

/** Typed failure. Deliberately carries no payload text: error screens built from it cannot echo server data. */
export interface ComposeError {
  code: ComposeErrorCode;
  /** The locale of the offending content stream, when known. */
  locale?: string;
  /** JSON path of the first problem, when core reported one. */
  path?: string;
}

export type ComposeResult = { ok: true; document: BuilderDocument } | { ok: false; error: ComposeError };

export interface ComposeInput {
  /** The stored layout envelope; `null` when the stream was never written. */
  layout: Record<string, unknown> | null;
  /** The stored content envelope per locale slot; `null` when that stream was never written. */
  contents: Record<string, Record<string, unknown> | null>;
  postId: number;
  defaultLocale: string;
  enabledLocales: readonly string[];
  /** Injected clock (milliseconds since the epoch); used for the skeleton's timestamp only. */
  now: () => number;
  /** `bootstrap.pluginVersion`; stamped as `metadata.editorVersion` on a new skeleton. */
  editorVersion?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const fail = (code: ComposeErrorCode, extra: { locale?: string; path?: string } = {}): ComposeResult => ({
  ok: false,
  error: { code, ...extra },
});

/** Second-precision UTC timestamp as the schema requires (`2026-01-01T00:00:00Z`). */
export function formatTimestamp(ms: number): string {
  const date = new Date(Number.isFinite(ms) ? ms : 0);
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function localeOfPath(path: string): string | undefined {
  const match = /^\$\.translations\.([^.[\]]+)/.exec(path);
  return match?.[1];
}

/** Builds a valid empty document: no elements, revision 0, an empty translation stream for every locale. */
export function createEmptyDocument(input: {
  postId: number;
  defaultLocale: string;
  locales: readonly string[];
  now: () => number;
  editorVersion?: string;
}): BuilderDocument {
  const locales = [...new Set([input.defaultLocale, ...input.locales])];
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    documentId: `post-${String(input.postId)}`,
    layoutRevision: 0,
    defaultLocale: input.defaultLocale,
    locales,
    root: [],
    classListVersion: 0,
    classRefs: {},
    translations: Object.fromEntries(locales.map((locale) => [locale, {}])),
    metadata: { updatedAt: formatTimestamp(input.now()), editorVersion: input.editorVersion ?? '0.0.0' },
  };
}

/**
 * Composes the in-memory document. Never returns a partially loaded document: any invalid stream yields a typed error.
 *
 * - A layout that was never written (`null`) becomes an empty skeleton (`createEmptyDocument`).
 * - A written layout keeps all its fields, unknown ones included; the locales of `enabledLocales` and of the content slots
 *   are appended to `locales` when missing (a locale enabled after the layout was saved).
 * - A content stream becomes `translations[locale]` (unknown entry fields are kept). A `null` content slot adds nothing;
 *   the default locale always has a (possibly empty) stream, as the schema requires.
 */
export function composeDocument(input: ComposeInput): ComposeResult {
  try {
    return composeUnchecked(input);
  } catch {
    // A hostile payload that exhausts the stack or throws from a getter is refused like any other invalid one.
    return fail('invalid-shape');
  }
}

function composeUnchecked(input: ComposeInput): ComposeResult {
  if (!Number.isSafeInteger(input.postId) || input.postId < 1) return fail('invalid-input');
  if (!isRecord(input.contents)) return fail('invalid-input');
  const slots = Object.keys(input.contents);

  // Locale slot and envelope checks come before any merging so a mismatch is reported as such.
  const streams: [string, Record<string, TranslationEntry>][] = [];
  for (const locale of slots) {
    const content = input.contents[locale];
    if (content === null || content === undefined) continue;
    if (!isRecord(content)) return fail('invalid-shape', { locale });
    if (findReservedKeys(content).length > 0) return fail('invalid-content', { locale });
    if (content['locale'] !== locale) return fail('locale-mismatch', { locale });
    if (content['schemaVersion'] !== CURRENT_SCHEMA_VERSION) return fail('unsupported-version', { locale });
    const entries = content['entries'];
    if (!isRecord(entries)) return fail('invalid-content', { locale, path: '$.entries' });
    streams.push([locale, entries as Record<string, TranslationEntry>]);
  }

  let base: Record<string, unknown>;
  if (input.layout === null) {
    base = { ...createEmptyDocument({ ...input, locales: [...input.enabledLocales, ...slots] }) };
  } else {
    if (!isRecord(input.layout)) return fail('invalid-shape');
    if (findReservedKeys(input.layout).length > 0) return fail('invalid-layout');
    if (Object.hasOwn(input.layout, 'translations')) return fail('invalid-shape', { path: '$.translations' });
    const declared = Array.isArray(input.layout['locales']) ? (input.layout['locales'] as unknown[]) : null;
    const declaredDefault = input.layout['defaultLocale'];
    base = { ...input.layout };
    if (declared !== null && typeof declaredDefault === 'string') {
      base['locales'] = [...new Set([...declared, ...input.enabledLocales, ...slots])];
    }
  }

  // The layout alone must be a valid document (an empty default-locale stream stands in for the content streams).
  const defaultLocale = typeof base['defaultLocale'] === 'string' ? base['defaultLocale'] : input.defaultLocale;
  const layoutOnly = validateDocument({ ...base, translations: { [defaultLocale]: {} } });
  if (!layoutOnly.ok) return fail('invalid-layout', { path: layoutOnly.errors[0]?.path ?? '$' });

  const translations: Record<string, Record<string, TranslationEntry>> = Object.create(null) as Record<
    string,
    Record<string, TranslationEntry>
  >;
  if (input.layout === null) {
    for (const locale of layoutOnly.document.locales) translations[locale] = {};
  } else {
    translations[defaultLocale] = {};
  }
  for (const [locale, entries] of streams) translations[locale] = entries;

  const full = validateDocument({ ...base, translations: { ...translations } });
  if (!full.ok) {
    const first = full.errors[0];
    const locale = first === undefined ? undefined : localeOfPath(first.path);
    return fail('invalid-content', { ...(locale === undefined ? {} : { locale }), path: first?.path ?? '$' });
  }
  return { ok: true, document: full.document };
}

export interface SplitDocument {
  /** The document without `translations`: the body of a layout write. */
  layout: Record<string, unknown>;
  /** One content envelope per locale that has a translation stream: the body of a content write. */
  contents: Record<
    string,
    { schemaVersion: number; contentRevision: number; locale: string; entries: Record<string, TranslationEntry> }
  >;
}

/**
 * The inverse of `composeDocument` for write routes. `contentRevision` is informational (the server stamps the real one on
 * save); pass the last known one to keep the envelope plausible. The returned objects share structure with `doc` and must
 * be treated as read-only (the REST client serialises them).
 */
export function splitDocument(
  doc: BuilderDocument,
  contentRevisions: Readonly<Record<string, number>> = {},
): SplitDocument {
  const { translations, ...layout } = doc;
  const contents: SplitDocument['contents'] = {};
  for (const locale of Object.keys(translations)) {
    contents[locale] = {
      schemaVersion: doc.schemaVersion,
      contentRevision: contentRevisions[locale] ?? 0,
      locale,
      entries: translations[locale] ?? {},
    };
  }
  return { layout, contents };
}

/**
 * Property used by tests and by the save slice as a safety net: composing what `splitDocument` produced gives the same
 * document back. True for every valid document.
 */
export function isSplitStable(doc: BuilderDocument, now: () => number = Date.now): boolean {
  const { layout, contents } = splitDocument(doc);
  const result = composeDocument({
    layout,
    contents,
    postId: 1,
    defaultLocale: doc.defaultLocale,
    enabledLocales: doc.locales,
    now,
  });
  return result.ok && deepEqual(result.document, doc);
}

/**
 * Structural equality with a reference shortcut at every level: unchanged subtrees (structural sharing from the command
 * engine) cost O(1), so comparing a large document with its saved snapshot only walks what changed.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  for (const key of keys) {
    if (!Object.hasOwn(right, key) || !deepEqual(left[key], right[key])) return false;
  }
  return true;
}
