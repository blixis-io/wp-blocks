import { validateDocument, type BuilderDocument } from '@blixis/wp-core';
import { describe, expect, it } from 'vitest';
import { makeDocument } from '../test/state-helpers';
import { composeDocument, createEmptyDocument, formatTimestamp, isSplitStable, splitDocument } from './compose';

const NOW = Date.UTC(2026, 4, 17, 10, 30, 15, 999);
const base = {
  postId: 42,
  defaultLocale: 'en_US',
  enabledLocales: ['en_US', 'fr_FR'],
  now: () => NOW,
  editorVersion: '0.1.0',
};

const compose = (layout: Record<string, unknown> | null, contents: Record<string, Record<string, unknown> | null>) =>
  composeDocument({ ...base, layout, contents });

const contentOf = (locale: string, entries: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  contentRevision: 7,
  locale,
  entries,
  ...extra,
});

describe('composeDocument', () => {
  it('creates a valid empty skeleton when the layout was never written', () => {
    const result = compose(null, { en_US: null, fr_FR: null });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document).toEqual({
      schemaVersion: 1,
      documentId: 'post-42',
      layoutRevision: 0,
      defaultLocale: 'en_US',
      locales: ['en_US', 'fr_FR'],
      root: [],
      classListVersion: 0,
      classRefs: {},
      translations: { en_US: {}, fr_FR: {} },
      metadata: { updatedAt: '2026-05-17T10:30:15Z', editorVersion: '0.1.0' },
    });
    expect(validateDocument(result.document).ok).toBe(true);
  });

  it('formats the injected clock at second precision and survives a broken clock', () => {
    expect(formatTimestamp(NOW)).toBe('2026-05-17T10:30:15Z');
    expect(formatTimestamp(Number.NaN)).toBe('1970-01-01T00:00:00Z');
    expect(createEmptyDocument({ postId: 3, defaultLocale: 'nl_NL', locales: [], now: () => 0 }).locales).toEqual([
      'nl_NL',
    ]);
  });

  it('merges each content stream into translations and keeps the layout fields', () => {
    const doc = makeDocument();
    const { layout, contents } = splitDocument(doc);
    const result = compose(layout, { en_US: contents['en_US'] ?? null, fr_FR: contents['fr_FR'] ?? null });
    expect(result).toEqual({ ok: true, document: doc });
    // A never-written content stream adds nothing but the default locale's (possibly empty) stream.
    const sparse = compose(layout, { en_US: contents['en_US'] ?? null, fr_FR: null });
    expect(sparse.ok && Object.keys(sparse.document.translations)).toEqual(['en_US']);
  });

  it('round-trips unknown fields on the layout, elements, entries and metadata', () => {
    const doc = makeDocument();
    const withExtras = {
      ...doc,
      futureTop: { a: [1, 2] },
      metadata: { ...doc.metadata, futureMeta: true },
      root: [{ ...doc.root[0], futureNode: 'x' }, ...doc.root.slice(1)],
      translations: {
        ...doc.translations,
        en_US: {
          ...doc.translations['en_US'],
          'el-heading-1': { values: { text: 'Hi' }, status: 'draft', futureEntry: 9 },
        },
      },
    } as unknown as BuilderDocument;
    const { layout, contents } = splitDocument(withExtras);
    expect(layout).not.toHaveProperty('translations');
    const result = compose(layout, { en_US: contents['en_US'] ?? null, fr_FR: contents['fr_FR'] ?? null });
    expect(result).toEqual({ ok: true, document: withExtras });
    expect(isSplitStable(withExtras)).toBe(true);
  });

  it('appends enabled locales missing from the layout', () => {
    const doc = makeDocument({ locales: ['en_US'], translations: { en_US: {} } });
    const { layout } = splitDocument(doc);
    const result = compose(layout, { en_US: null, fr_FR: contentOf('fr_FR', {}) });
    expect(result.ok && result.document.locales).toEqual(['en_US', 'fr_FR']);
    expect(result.ok && result.document.translations).toEqual({ en_US: {}, fr_FR: {} });
  });

  it('refuses a content stream whose locale differs from its slot', () => {
    const { layout } = splitDocument(makeDocument());
    const result = compose(layout, { en_US: contentOf('fr_FR', {}), fr_FR: null });
    expect(result).toEqual({ ok: false, error: { code: 'locale-mismatch', locale: 'en_US' } });
    expect(compose(layout, { fr_FR: { schemaVersion: 1, entries: {} } })).toMatchObject({
      ok: false,
      error: { code: 'locale-mismatch' },
    });
  });

  it('refuses unsupported versions, wrong types and missing entries', () => {
    const { layout } = splitDocument(makeDocument());
    expect(compose(layout, { en_US: contentOf('en_US', {}, { schemaVersion: 2 }) })).toMatchObject({
      error: { code: 'unsupported-version', locale: 'en_US' },
    });
    expect(compose(layout, { en_US: contentOf('en_US', {}, { entries: [] }) })).toMatchObject({
      error: { code: 'invalid-content' },
    });
    expect(compose(layout, { en_US: 'nope' as unknown as null })).toMatchObject({ error: { code: 'invalid-shape' } });
    expect(compose(layout, { en_US: [] as unknown as null })).toMatchObject({ error: { code: 'invalid-shape' } });
    expect(compose('nope' as unknown as null, {})).toMatchObject({ error: { code: 'invalid-shape' } });
    expect(compose([] as unknown as null, {})).toMatchObject({ error: { code: 'invalid-shape' } });
    expect(composeDocument({ ...base, postId: 0, layout: null, contents: {} })).toMatchObject({
      error: { code: 'invalid-input' },
    });
    expect(composeDocument({ ...base, layout: null, contents: null as unknown as Record<string, null> })).toMatchObject(
      {
        error: { code: 'invalid-input' },
      },
    );
  });

  it('refuses a layout that carries translations or is not a valid document', () => {
    const { layout } = splitDocument(makeDocument());
    expect(compose({ ...layout, translations: {} }, {})).toMatchObject({ error: { code: 'invalid-shape' } });
    expect(compose({ ...layout, schemaVersion: 99 }, {})).toMatchObject({ error: { code: 'invalid-layout' } });
    expect(compose({ ...layout, root: 'x' }, {})).toMatchObject({ error: { code: 'invalid-layout' } });
    expect(compose({ ...layout, locales: 'x' }, {})).toMatchObject({ error: { code: 'invalid-layout' } });
    expect(compose({}, {})).toMatchObject({ error: { code: 'invalid-layout' } });
  });

  it('refuses entries that do not fit the layout, naming only the locale', () => {
    const { layout } = splitDocument(makeDocument());
    const result = compose(layout, {
      fr_FR: contentOf('fr_FR', { 'el-missing': { values: { text: 'x' }, status: 'draft' } }),
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid-content', locale: 'fr_FR' } });
    expect(
      compose(layout, { fr_FR: contentOf('fr_FR', { 'el-heading-1': { values: { text: 1.5 }, status: 'draft' } }) }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-content' } });
  });

  describe('hostile payloads', () => {
    it('refuses reserved keys anywhere, in either stream', () => {
      const { layout } = splitDocument(makeDocument());
      const proto = JSON.parse('{"__proto__": {"polluted": true}}') as Record<string, unknown>;
      expect(compose({ ...layout, extra: proto }, {})).toMatchObject({ error: { code: 'invalid-layout' } });
      const entry = { values: JSON.parse('{"__proto__": 1}') as Record<string, unknown>, status: 'draft' };
      expect(compose(layout, { fr_FR: contentOf('fr_FR', { 'el-heading-1': entry }) })).toMatchObject({
        error: { code: 'invalid-content', locale: 'fr_FR' },
      });
      const slots = JSON.parse('{"__proto__": null}') as Record<string, null>;
      expect(compose(layout, slots).ok).toBe(false); // a slot named like a reserved key can never become a locale
      expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    });

    it('refuses a locale slot named __proto__ with entries', () => {
      const { layout } = splitDocument(makeDocument());
      const slots = JSON.parse(`{"__proto__": ${JSON.stringify(contentOf('__proto__', {}))}}`) as Record<string, never>;
      expect(compose(layout, slots).ok).toBe(false);
    });

    it('refuses oversized trees and wrong value types', () => {
      const { layout } = splitDocument(makeDocument());
      const many = Array.from({ length: 5001 }, (_, i) => ({
        id: `el-n${String(i).padStart(5, '0')}`,
        type: 'blixis/text',
        props: {},
        children: [],
      }));
      expect(compose({ ...layout, root: many }, {})).toMatchObject({ error: { code: 'invalid-layout' } });
      const huge = { ...layout, blob: 'x'.repeat(3 * 1024 * 1024) };
      expect(compose(huge, {})).toMatchObject({ error: { code: 'invalid-layout' } });
      let deep: Record<string, unknown> = { leaf: true };
      for (let i = 0; i < 20_000; i += 1) deep = { deep };
      expect(compose({ ...layout, deep }, {}).ok).toBe(false);
      expect(compose({ ...layout, documentId: 5 }, {})).toMatchObject({ error: { code: 'invalid-layout' } });
    });

    it('refuses getters and class instances instead of reading them', () => {
      const { layout } = splitDocument(makeDocument());
      const trap = { ...layout };
      Object.defineProperty(trap, 'sneaky', {
        enumerable: true,
        get() {
          throw new Error('boom');
        },
      });
      expect(compose(trap, {}).ok).toBe(false);
    });
  });
});

describe('splitDocument / isSplitStable', () => {
  it('produces write bodies: layout without translations and one envelope per locale', () => {
    const doc = makeDocument();
    const { layout, contents } = splitDocument(doc, { en_US: 9 });
    expect(Object.keys(layout)).not.toContain('translations');
    expect(layout['root']).toBe(doc.root);
    expect(contents['en_US']).toEqual({
      schemaVersion: 1,
      contentRevision: 9,
      locale: 'en_US',
      entries: doc.translations['en_US'],
    });
    expect(contents['fr_FR']).toMatchObject({ contentRevision: 0, entries: {} });
  });

  it('omits locales that have no translation stream, and is still stable', () => {
    const doc = makeDocument({ translations: { en_US: {} } });
    expect(Object.keys(splitDocument(doc).contents)).toEqual(['en_US']);
    expect(isSplitStable(doc)).toBe(true);
  });

  it('is stable for documents with several locales and orphaned entries', () => {
    const doc = makeDocument({
      locales: ['en_US', 'fr_FR', 'nl_NL'],
      translations: {
        en_US: {},
        fr_FR: { 'el-gone-1': { values: { text: 'x' }, status: 'orphaned' } },
        nl_NL: { 'el-text-1': { values: { text: 'Wereld' }, status: 'stale', sourceHash: 'abcdef0123456789' } },
      },
    });
    expect(validateDocument(doc).ok).toBe(true);
    expect(isSplitStable(doc)).toBe(true);
  });
});
