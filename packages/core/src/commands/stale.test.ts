import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  createHistory,
  execute,
  redo,
  undo,
  validateDocument,
  type BuilderDocument,
  type Command,
  type CommandContext,
} from '../index.ts';

/** The expected marker, computed independently of the implementation (flat string values only). */
const H = (values: Record<string, string>): string => {
  const sorted = Object.fromEntries(Object.entries(values).sort(([a], [b]) => (a < b ? -1 : 1)));
  return createHash('sha256').update(JSON.stringify(sorted), 'utf8').digest('hex').slice(0, 16);
};

const build = (translations: BuilderDocument['translations']): BuilderDocument => {
  const result = validateDocument({
    schemaVersion: 1,
    documentId: 'doc-001',
    layoutRevision: 1,
    defaultLocale: 'en_US',
    locales: ['en_US', 'nl_NL', 'de_DE'],
    root: [
      { id: 'el-a', type: 'blixis/button', props: {}, children: [] },
      { id: 'el-b', type: 'blixis/text', props: {}, children: [] },
    ],
    classListVersion: 0,
    classRefs: {},
    translations,
    metadata: { updatedAt: '2026-01-01T00:00:00Z', editorVersion: '0.0.0' },
  });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.document;
};

const fresh = (): BuilderDocument =>
  build({
    en_US: {
      'el-a': { status: 'translated', values: { label: 'Hello', href: '/en' } },
      'el-b': { status: 'translated', values: { text: 'Body' } },
    },
    nl_NL: {
      'el-a': { status: 'reviewed', values: { label: 'Hallo', href: '/nl' }, sourceHash: H({ label: 'Hello' }) },
      'el-b': { status: 'draft', values: { text: 'Tekst' }, sourceHash: H({ text: 'Body' }) },
    },
    de_DE: { 'el-a': { status: 'translated', values: { label: 'Hallo' }, sourceHash: H({ label: 'Hello' }) } },
  });

/** Only `label` and `text` are source text; `href` is locale-specific and differs per language. */
const ctx: CommandContext = { sourceProperties: (type) => (type === 'blixis/button' ? ['label'] : ['text']) };

const ok = (doc: BuilderDocument, command: unknown, c: CommandContext = ctx) => {
  const r = applyCommand(doc, command, c);
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r;
};
const statusOf = (doc: BuilderDocument, locale: string, id: string): string | undefined =>
  doc.translations[locale]?.[id]?.status;

describe('source markers on translation edits', () => {
  it('a translation edit records the digest of the current default-locale source text', () => {
    const r = ok(fresh(), { type: 'set-translation', locale: 'nl_NL', elementId: 'el-b', set: { text: 'Nieuw' } });
    expect(r.document.translations['nl_NL']?.['el-b']).toEqual({
      values: { text: 'Nieuw' },
      status: 'draft',
      sourceHash: H({ text: 'Body' }),
    });
  });

  it('only counts source properties: the link is not part of the marker', () => {
    const r = ok(fresh(), {
      type: 'set-translation',
      locale: 'nl_NL',
      elementId: 'el-a',
      set: { href: '/nl/contact' },
    });
    expect(r.document.translations['nl_NL']?.['el-a']?.sourceHash).toBe(H({ label: 'Hello' }));
  });

  it('without the hook every default-locale value counts', () => {
    const r = ok(fresh(), { type: 'set-translation', locale: 'nl_NL', elementId: 'el-a', set: { label: 'x' } }, {});
    expect(r.document.translations['nl_NL']?.['el-a']?.sourceHash).toBe(H({ href: '/en', label: 'Hello' }));
  });

  it('an element without a default-locale entry has no marker', () => {
    const base = fresh();
    const noSource: BuilderDocument = {
      ...base,
      translations: {
        ...base.translations,
        en_US: { 'el-a': base.translations['en_US']?.['el-a'] ?? { status: 'draft', values: {} } },
      },
    };
    const r = ok(noSource, { type: 'set-translation', locale: 'nl_NL', elementId: 'el-b', set: { text: 'x' } });
    expect(r.document.translations['nl_NL']?.['el-b']).toEqual({ values: { text: 'x' }, status: 'draft' });
  });
});

describe('a source edit flags dependent translations as stale and keeps their text', () => {
  it('marks reviewed, translated and draft entries made from the old text, in every locale', () => {
    const r = ok(fresh(), { type: 'set-translation', locale: 'en_US', elementId: 'el-a', set: { label: 'Hi there' } });
    expect(statusOf(r.document, 'nl_NL', 'el-a')).toBe('stale');
    expect(statusOf(r.document, 'de_DE', 'el-a')).toBe('stale');
    expect(statusOf(r.document, 'nl_NL', 'el-b')).toBe('draft');
    // the words and the old marker are untouched
    expect(r.document.translations['nl_NL']?.['el-a']).toEqual({
      values: { label: 'Hallo', href: '/nl' },
      sourceHash: H({ label: 'Hello' }),
      status: 'stale',
    });
    const draft = ok(fresh(), {
      type: 'set-translation',
      locale: 'en_US',
      elementId: 'el-b',
      set: { text: 'Changed' },
    });
    expect(draft.document.translations['nl_NL']?.['el-b']).toEqual({
      values: { text: 'Tekst' },
      sourceHash: H({ text: 'Body' }),
      status: 'stale',
    });
  });

  it('leaves missing, stale and orphaned entries and entries already made from the new text alone', () => {
    const base = fresh();
    const mixed = build({
      ...base.translations,
      nl_NL: {
        'el-a': { status: 'missing', values: {} },
        'el-b': { status: 'translated', values: { text: 'Tekst' }, sourceHash: H({ text: 'Changed' }) },
      },
      de_DE: { 'el-a': { status: 'stale', values: { label: 'Hallo' } } },
    });
    const a = ok(mixed, { type: 'set-translation', locale: 'en_US', elementId: 'el-a', set: { label: 'New' } });
    expect(statusOf(a.document, 'nl_NL', 'el-a')).toBe('missing');
    expect(statusOf(a.document, 'de_DE', 'el-a')).toBe('stale');
    const b = ok(mixed, { type: 'set-translation', locale: 'en_US', elementId: 'el-b', set: { text: 'Changed' } });
    expect(statusOf(b.document, 'nl_NL', 'el-b')).toBe('translated');
  });

  it('an edit of a locale-specific value, or one that changes no source text, flags nothing', () => {
    const link = ok(fresh(), { type: 'set-translation', locale: 'en_US', elementId: 'el-a', set: { href: '/en/new' } });
    expect(statusOf(link.document, 'nl_NL', 'el-a')).toBe('reviewed');
    const same = ok(fresh(), {
      type: 'set-translation',
      locale: 'en_US',
      elementId: 'el-a',
      set: { label: 'Hello' },
      status: 'reviewed',
    });
    expect(statusOf(same.document, 'nl_NL', 'el-a')).toBe('reviewed');
  });

  it('undo and redo restore the statuses exactly', () => {
    const start = fresh();
    let history = createHistory(start);
    const run = (r: ReturnType<typeof execute>) => {
      if (!r.ok) throw new Error(r.error.message);
      history = r.history;
    };
    run(
      execute(
        history,
        { type: 'set-translation', locale: 'en_US', elementId: 'el-a', set: { label: 'Hi there' } },
        ctx,
      ),
    );
    const after = history.document;
    expect(statusOf(after, 'nl_NL', 'el-a')).toBe('stale');
    run(undo(history, ctx));
    expect(history.document).toEqual(start);
    run(redo(history, ctx));
    expect(history.document).toEqual(after);
  });

  it('a translator confirms a stale entry with an explicit status, which refreshes its marker', () => {
    const stale = ok(fresh(), {
      type: 'set-translation',
      locale: 'en_US',
      elementId: 'el-a',
      set: { label: 'Hi there' },
    }).document;
    const confirmed = ok(stale, { type: 'set-translation', locale: 'nl_NL', elementId: 'el-a', status: 'translated' });
    expect(confirmed.document.translations['nl_NL']?.['el-a']).toEqual({
      values: { label: 'Hallo', href: '/nl' },
      sourceHash: H({ label: 'Hi there' }),
      status: 'translated',
    });
    // editing the translation (even without a status) also leaves the stale state, as a draft made from the current text
    const edited = ok(stale, {
      type: 'set-translation',
      locale: 'nl_NL',
      elementId: 'el-a',
      set: { label: 'Hoi daar' },
    });
    expect(edited.document.translations['nl_NL']?.['el-a']).toMatchObject({
      status: 'draft',
      sourceHash: H({ label: 'Hi there' }),
    });
  });
});

describe('the source marker is only refreshed when the translator has seen the source', () => {
  const staleDoc = (): BuilderDocument =>
    ok(fresh(), { type: 'set-translation', locale: 'en_US', elementId: 'el-a', set: { label: 'Hi there' } }).document;

  it('editing a link or choosing draft does not make a stale translation look current', () => {
    const link = ok(staleDoc(), {
      type: 'set-translation',
      locale: 'nl_NL',
      elementId: 'el-a',
      set: { href: '/nl/nieuw' },
    });
    expect(link.document.translations['nl_NL']?.['el-a']).toMatchObject({
      status: 'stale',
      sourceHash: H({ label: 'Hello' }),
      values: { href: '/nl/nieuw' },
    });
    const draft = ok(staleDoc(), { type: 'set-translation', locale: 'nl_NL', elementId: 'el-a', status: 'draft' });
    expect(draft.document.translations['nl_NL']?.['el-a']).toMatchObject({
      status: 'stale',
      sourceHash: H({ label: 'Hello' }),
    });
  });

  it('editing translatable text refreshes it; translated and reviewed confirm explicitly', () => {
    const text = ok(staleDoc(), {
      type: 'set-translation',
      locale: 'nl_NL',
      elementId: 'el-a',
      set: { label: 'Hoi daar' },
    });
    expect(text.document.translations['nl_NL']?.['el-a']).toMatchObject({
      status: 'draft',
      sourceHash: H({ label: 'Hi there' }),
    });
    for (const status of ['translated', 'reviewed'] as const) {
      const confirmed = ok(staleDoc(), { type: 'set-translation', locale: 'nl_NL', elementId: 'el-a', status });
      expect(confirmed.document.translations['nl_NL']?.['el-a']).toMatchObject({
        status,
        sourceHash: H({ label: 'Hi there' }),
      });
    }
  });

  it('editing a link on an up-to-date reviewed translation leaves review but stays current', () => {
    const link = ok(fresh(), {
      type: 'set-translation',
      locale: 'nl_NL',
      elementId: 'el-a',
      set: { href: '/nl/nieuw' },
    });
    expect(link.document.translations['nl_NL']?.['el-a']).toMatchObject({
      status: 'draft',
      sourceHash: H({ label: 'Hello' }),
    });
  });
});

describe('edge cases of the source', () => {
  it('an element of an unknown type is never judged stale (the add-on is gone)', () => {
    const unknownCtx: CommandContext = { sourceProperties: () => undefined };
    const edited = ok(
      fresh(),
      { type: 'set-translation', locale: 'en_US', elementId: 'el-a', set: { label: 'Changed' } },
      unknownCtx,
    );
    expect(statusOf(edited.document, 'nl_NL', 'el-a')).toBe('reviewed');
    expect(ok(edited.document, { type: 'mark-stale' }, unknownCtx).document).toBe(edited.document);
    const written = ok(
      fresh(),
      { type: 'set-translation', locale: 'nl_NL', elementId: 'el-b', set: { text: 'z' } },
      unknownCtx,
    );
    expect(written.document.translations['nl_NL']?.['el-b']).toEqual({ values: { text: 'z' }, status: 'draft' });
  });

  it('a source that appears after the translations flags them (they were made without any source)', () => {
    const base = fresh();
    const withoutSource = build({ ...base.translations, en_US: {} });
    const created = ok(withoutSource, {
      type: 'set-translation',
      locale: 'en_US',
      elementId: 'el-b',
      set: { text: 'Body' },
    });
    expect(statusOf(created.document, 'nl_NL', 'el-b')).toBe('draft'); // marker equals the new source: made from it
    const other = ok(withoutSource, {
      type: 'set-translation',
      locale: 'en_US',
      elementId: 'el-b',
      set: { text: 'Different' },
    });
    expect(statusOf(other.document, 'nl_NL', 'el-b')).toBe('stale');
  });

  it('a default entry holding only a link counts as an empty source', () => {
    const base = fresh();
    const noText = build({ ...base.translations, en_US: {} });
    const created = ok(noText, { type: 'set-translation', locale: 'en_US', elementId: 'el-a', set: { href: '/en' } });
    expect(statusOf(created.document, 'nl_NL', 'el-a')).toBe('stale');
  });
});

describe('mark-stale', () => {
  const drifted = (): BuilderDocument => {
    const base = fresh();
    return build({
      ...base.translations,
      en_US: {
        ...base.translations['en_US'],
        'el-a': { status: 'translated', values: { label: 'Changed', href: '/en' } },
      },
      nl_NL: { ...base.translations['nl_NL'], 'el-b': { status: 'reviewed', values: { text: 'Tekst' } } },
    });
  };

  it('flags entries whose marker is missing or differs, in all locales or one', () => {
    const all = ok(drifted(), { type: 'mark-stale' });
    expect(statusOf(all.document, 'nl_NL', 'el-a')).toBe('stale');
    expect(statusOf(all.document, 'de_DE', 'el-a')).toBe('stale');
    expect(statusOf(all.document, 'nl_NL', 'el-b')).toBe('stale'); // no marker at all: potentially stale
    const one = ok(drifted(), { type: 'mark-stale', locale: 'de_DE' });
    expect(statusOf(one.document, 'de_DE', 'el-a')).toBe('stale');
    expect(statusOf(one.document, 'nl_NL', 'el-a')).toBe('reviewed');
  });

  it('is idempotent, a no-op on a consistent document, and exactly undoable', () => {
    const start = drifted();
    const first = ok(start, { type: 'mark-stale' });
    const second = ok(first.document, { type: 'mark-stale' });
    expect(second.document).toBe(first.document);
    expect(ok(fresh(), { type: 'mark-stale' }).document).toEqual(fresh());
    const back = ok(first.document, first.inverse);
    expect(back.document).toEqual(start);
  });

  it('refuses the default locale and unknown locales, and ignores orphaned and unknown-typed entries', () => {
    const codeOf = (command: unknown): string => {
      const r = applyCommand(fresh(), command, ctx);
      return r.ok ? 'ok' : r.error.code;
    };
    expect(codeOf({ type: 'mark-stale', locale: 'en_US' })).toBe('invalid-argument');
    expect(codeOf({ type: 'mark-stale', locale: 'fr_FR' })).toBe('locale-not-found');
    expect(codeOf({ type: 'mark-stale', locale: 'nl_NL' })).toBe('ok');
    const base = drifted();
    const orphaned = build({
      ...base.translations,
      nl_NL: { ...base.translations['nl_NL'], 'el-gone': { status: 'orphaned', values: { text: 'x' } } },
    });
    expect(statusOf(ok(orphaned, { type: 'mark-stale' }).document, 'nl_NL', 'el-gone')).toBe('orphaned');
  });

  it('restore-statuses is internal; even as a trusted inverse it only touches live entries and cannot orphan', () => {
    const untrusted = applyCommand(
      fresh(),
      { type: 'restore-statuses', statuses: [{ locale: 'nl_NL', elementId: 'el-a', status: 'reviewed' }] },
      ctx,
    );
    expect(untrusted.ok ? 'ok' : untrusted.error.code).toBe('invalid-argument');
    const codeOf = (statuses: unknown[]): string => {
      const real = ok(drifted(), { type: 'mark-stale' });
      (real.inverse as unknown as { statuses: unknown[] }).statuses = statuses;
      const r = applyCommand(real.document, real.inverse, ctx);
      return r.ok ? 'ok' : r.error.code;
    };
    expect(codeOf([{ locale: 'nl_NL', elementId: 'el-a', status: 'draft' }])).toBe('ok');
    expect(codeOf([{ locale: 'nl_NL', elementId: 'el-zzz', status: 'draft' }])).toBe('stale-restore');
    expect(codeOf([{ locale: 'nl_NL', elementId: 'el-a', status: 'orphaned' }])).toBe('invalid-argument');
    expect(
      codeOf([
        { locale: 'nl_NL', elementId: 'el-a', status: 'draft' },
        { locale: 'nl_NL', elementId: 'el-a', status: 'reviewed' },
      ]),
    ).toBe('invalid-argument');
    expect(codeOf([{ locale: 'nl_NL', elementId: 'el-a', status: 'nope' }])).toBe('invalid-argument');
  });

  it('marks a 2,500-element, two-locale document in linear time', () => {
    const elements = Array.from({ length: 2500 }, (_v, i) => ({
      id: `el-${String(i).padStart(4, '0')}`,
      type: 'blixis/text',
      props: {},
      children: [],
    }));
    const en: BuilderDocument['translations'][string] = {};
    const nl: BuilderDocument['translations'][string] = {};
    const de: BuilderDocument['translations'][string] = {};
    for (const e of elements) {
      en[e.id] = { status: 'translated', values: { text: `Source ${e.id}` } };
      nl[e.id] = { status: 'translated', values: { text: 'x' }, sourceHash: 'deadbeefdeadbeef' };
      de[e.id] = { status: 'reviewed', values: { text: 'y' } };
    }
    const result = validateDocument({
      schemaVersion: 1,
      documentId: 'doc-001',
      layoutRevision: 1,
      defaultLocale: 'en_US',
      locales: ['en_US', 'nl_NL', 'de_DE'],
      root: elements,
      classListVersion: 0,
      classRefs: {},
      translations: { en_US: en, nl_NL: nl, de_DE: de },
      metadata: { updatedAt: '2026-01-01T00:00:00Z', editorVersion: '0.0.0' },
    });
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    const started = Date.now();
    const marked = ok(result.document, { type: 'mark-stale' });
    expect(Date.now() - started).toBeLessThan(400);
    expect(Object.values(marked.document.translations['nl_NL'] ?? {}).every((e) => e.status === 'stale')).toBe(true);
    expect(ok(marked.document, marked.inverse).document).toEqual(result.document);
  });

  it('a seeded random mix keeps the invariant: no draft, translated or reviewed entry has a marker different from the source', () => {
    let seed = 2026;
    const next = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const pick = <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)] as T;
    let history = createHistory(fresh(), 10_000);
    const invariant = (doc: BuilderDocument): void => {
      for (const locale of ['nl_NL', 'de_DE']) {
        for (const [id, entry] of Object.entries(doc.translations[locale] ?? {})) {
          if (!['draft', 'translated', 'reviewed'].includes(entry.status)) continue;
          const source = doc.translations['en_US']?.[id];
          const type = id === 'el-a' ? 'blixis/button' : 'blixis/text';
          const ids = ctx.sourceProperties?.(type) ?? [];
          const values = Object.fromEntries(
            Object.entries(source?.values ?? {}).filter(([k]) => ids.includes(k)),
          ) as Record<string, string>;
          expect(entry.sourceHash, `${locale}/${id}`).toBe(H(values));
        }
      }
    };
    invariant(history.document);
    const start = history.document;
    for (let n = 0; n < 400; n += 1) {
      const roll = next();
      let result;
      if (roll < 0.45) {
        const id = pick(['el-a', 'el-b']);
        const property = id === 'el-a' ? pick(['label', 'href']) : 'text';
        const command: Command = {
          type: 'set-translation',
          locale: 'en_US',
          elementId: id,
          set: { [property]: pick(['a', 'b', 'c']) },
        };
        result = execute(history, command, ctx);
      } else if (roll < 0.75) {
        const command: Command = {
          type: 'set-translation',
          locale: pick(['nl_NL', 'de_DE']),
          elementId: pick(['el-a', 'el-b']),
          ...(next() < 0.5
            ? { status: pick(['draft', 'translated', 'reviewed'] as const) }
            : { set: { [pick(['label', 'text'])]: pick(['x', 'y']) } }),
        };
        result = execute(history, command, ctx);
      } else if (roll < 0.8) {
        result = execute(history, { type: 'mark-stale' }, ctx);
      } else if (roll < 0.9) {
        result = undo(history, ctx);
      } else {
        result = redo(history, ctx);
      }
      if (!result.ok) continue;
      history = result.history;
      invariant(history.document);
    }
    while (history.past.length > 0) {
      const r = undo(history, ctx);
      if (!r.ok) throw new Error(r.error.message);
      history = r.history;
    }
    expect(history.document).toEqual(start);
  });
});
