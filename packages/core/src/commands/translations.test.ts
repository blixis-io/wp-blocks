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
  type ElementNode,
  type TranslationCheck,
} from '../index.ts';

/** The expected source marker, computed independently of the implementation (flat string values only). */
const H = (values: Record<string, string>): string => {
  const sorted = Object.fromEntries(Object.entries(values).sort(([a], [b]) => (a < b ? -1 : 1)));
  return createHash('sha256').update(JSON.stringify(sorted), 'utf8').digest('hex').slice(0, 16);
};

const el = (id: string, type: string, children: ElementNode[] = []): ElementNode => ({ id, type, props: {}, children });

const baseDoc = (): BuilderDocument => {
  const result = validateDocument({
    schemaVersion: 1,
    documentId: 'doc-001',
    layoutRevision: 1,
    defaultLocale: 'en_US',
    locales: ['en_US', 'nl_NL'],
    root: [el('el-a', 'blixis/heading'), el('el-b', 'blixis/text'), el('el-c', 'blixis/image')],
    classListVersion: 0,
    classRefs: {},
    translations: {
      en_US: {
        'el-a': { status: 'reviewed', values: { text: 'Hello' }, note: { keep: 'me' } },
        'el-b': { status: 'translated', values: { text: 'Body' } },
      },
      nl_NL: { 'el-a': { status: 'reviewed', values: { text: 'Hallo' }, sourceHash: 'abcdef12' } },
    },
    metadata: { updatedAt: '2026-01-01T00:00:00Z', editorVersion: '0.0.0' },
  });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.document;
};

const ok = (doc: BuilderDocument, command: unknown, ctx: CommandContext = {}) => {
  const result = applyCommand(doc, command, ctx);
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result;
};
const code = (doc: BuilderDocument, command: unknown, ctx: CommandContext = {}): string => {
  const result = applyCommand(doc, command, ctx);
  return result.ok ? 'ok' : result.error.code;
};
/** A stand-in for the registry hook: only `text` and `alt` are translatable, `text` at most 20 characters. */
const hook: CommandContext = {
  translationValue: (type, property, value): TranslationCheck => {
    if (
      (type !== 'blixis/heading' && type !== 'blixis/text' && type !== 'blixis/image') ||
      (property !== 'text' && property !== 'alt')
    )
      return { ok: false, code: 'not-translatable', message: `${property} is not translatable on ${type}` };
    if (typeof value !== 'string' || value.length > 20)
      return { ok: false, code: 'invalid-translation', message: 'at most 20 characters' };
    return { ok: true };
  },
};

describe('set-translation', () => {
  it('creates an entry: draft in a translation locale, translated in the default locale', () => {
    const nl = ok(baseDoc(), { type: 'set-translation', locale: 'nl_NL', elementId: 'el-b', set: { text: 'Tekst' } });
    expect(nl.document.translations['nl_NL']?.['el-b']).toEqual({
      values: { text: 'Tekst' },
      status: 'draft',
      sourceHash: H({ text: 'Body' }),
    });
    const en = ok(baseDoc(), { type: 'set-translation', locale: 'en_US', elementId: 'el-c', set: { alt: 'Logo' } });
    expect(en.document.translations['en_US']?.['el-c']).toEqual({ values: { alt: 'Logo' }, status: 'translated' });
  });

  it('merges into an entry, keeps unknown fields and the source hash, and leaves review unless a status is given', () => {
    const merged = ok(baseDoc(), { type: 'set-translation', locale: 'nl_NL', elementId: 'el-a', set: { alt: 'Een' } });
    expect(merged.document.translations['nl_NL']?.['el-a']).toEqual({
      values: { text: 'Hallo', alt: 'Een' },
      sourceHash: H({ text: 'Hello' }),
      status: 'draft',
    });
    const kept = ok(baseDoc(), { type: 'set-translation', locale: 'en_US', elementId: 'el-a', set: { text: 'Hi' } });
    expect(kept.document.translations['en_US']?.['el-a']).toEqual({
      values: { text: 'Hi' },
      note: { keep: 'me' },
      status: 'translated',
    });
    const reviewed = ok(baseDoc(), {
      type: 'set-translation',
      locale: 'nl_NL',
      elementId: 'el-a',
      set: { text: 'Hoi' },
      status: 'reviewed',
    });
    expect(reviewed.document.translations['nl_NL']?.['el-a']?.status).toBe('reviewed');
  });

  it('removes values and only changes the status when asked to', () => {
    const removed = ok(baseDoc(), {
      type: 'set-translation',
      locale: 'nl_NL',
      elementId: 'el-a',
      unset: ['text'],
      status: 'draft',
    });
    expect(removed.document.translations['nl_NL']?.['el-a']?.values).toEqual({});
    const statusOnly = ok(baseDoc(), {
      type: 'set-translation',
      locale: 'nl_NL',
      elementId: 'el-a',
      status: 'translated',
    });
    expect(statusOnly.document.translations['nl_NL']?.['el-a']).toEqual({
      values: { text: 'Hallo' },
      sourceHash: H({ text: 'Hello' }),
      status: 'translated',
    });
  });

  it('refuses what cannot be applied, with stable codes', () => {
    const d = baseDoc();
    expect(code(d, { type: 'set-translation', locale: 'fr_FR', elementId: 'el-a', set: { text: 'x' } })).toBe(
      'locale-not-found',
    );
    expect(code(d, { type: 'set-translation', locale: 'nl_NL', elementId: 'el-zzz', set: { text: 'x' } })).toBe(
      'element-not-found',
    );
    expect(
      code(d, { type: 'set-translation', locale: 'nl_NL', elementId: 'el-a', set: { text: 'x' }, unset: ['text'] }),
    ).toBe('invalid-argument');
    expect(
      code(d, { type: 'set-translation', locale: 'nl_NL', elementId: 'el-a', set: { text: 'x' }, status: 'stale' }),
    ).toBe('invalid-argument');
    expect(
      code(d, { type: 'set-translation', locale: 'nl_NL', elementId: 'el-a', set: { text: 'x' }, status: 'orphaned' }),
    ).toBe('invalid-argument');
    expect(code(d, { type: 'set-translation', locale: 'nl_NL', elementId: 'el-a', set: { text: 'x' }, extra: 1 })).toBe(
      'invalid-argument',
    );
    expect(code(d, { type: 'set-translation', locale: 'nl_NL', elementId: 'el-a', set: { 'bad id': 'x' } })).toBe(
      'invalid-argument',
    );
  });

  it('asks the registry hook: unknown or untranslatable properties and invalid values are refused', () => {
    const d = baseDoc();
    expect(code(d, { type: 'set-translation', locale: 'nl_NL', elementId: 'el-a', set: { text: 'Kort' } }, hook)).toBe(
      'ok',
    );
    expect(code(d, { type: 'set-translation', locale: 'nl_NL', elementId: 'el-a', set: { level: 2 } }, hook)).toBe(
      'not-translatable',
    );
    expect(
      code(d, { type: 'set-translation', locale: 'nl_NL', elementId: 'el-a', set: { text: 'x'.repeat(21) } }, hook),
    ).toBe('invalid-translation');
    expect(code(d, { type: 'set-translation', locale: 'nl_NL', elementId: 'el-a', set: { text: 5 } }, hook)).toBe(
      'invalid-translation',
    );
    // without a hook any registered property id is accepted
    expect(code(d, { type: 'set-translation', locale: 'nl_NL', elementId: 'el-a', set: { level: 2 } })).toBe('ok');
  });

  it('accepts prototype-named property ids as data', () => {
    const result = ok(baseDoc(), {
      type: 'set-translation',
      locale: 'nl_NL',
      elementId: 'el-b',
      set: { toString: 'a', valueOf: 'b', hasOwnProperty: 'c' },
    });
    expect(Object.keys(result.document.translations['nl_NL']?.['el-b']?.values ?? {})).toEqual([
      'toString',
      'valueOf',
      'hasOwnProperty',
    ]);
    const back = ok(result.document, {
      type: 'set-translation',
      locale: 'nl_NL',
      elementId: 'el-b',
      unset: ['toString'],
    });
    expect(Object.keys(back.document.translations['nl_NL']?.['el-b']?.values ?? {})).toEqual([
      'valueOf',
      'hasOwnProperty',
    ]);
  });

  it('refuses an orphaned entry on a live element and hostile input without throwing', () => {
    const d = baseDoc();
    const orphaned: BuilderDocument = {
      ...d,
      translations: {
        ...d.translations,
        nl_NL: { ...d.translations['nl_NL'], 'el-b': { status: 'orphaned', values: { text: 'x' } } },
      },
    };
    expect(code(orphaned, { type: 'set-translation', locale: 'nl_NL', elementId: 'el-b', set: { text: 'y' } })).toBe(
      'invalid-argument',
    );
    const hostile: unknown = JSON.parse(
      '{"type":"set-translation","locale":"nl_NL","elementId":"el-a","set":{"__proto__":"x"}}',
    );
    expect(code(d, hostile)).toBe('invalid-argument');
    const throwing: CommandContext = {
      translationValue: () => {
        throw new Error('boom');
      },
    };
    expect(code(d, { type: 'set-translation', locale: 'nl_NL', elementId: 'el-a', set: { text: 'x' } }, throwing)).toBe(
      'invalid-argument',
    );
  });

  it('fails when the result would be too large', () => {
    const big = 'x'.repeat(100_000);
    let doc = baseDoc();
    let failed = '';
    for (let i = 0; i < 30 && failed === ''; i += 1) {
      const result = applyCommand(doc, {
        type: 'set-translation',
        locale: 'nl_NL',
        elementId: 'el-b',
        set: { [`p${String(i)}`]: big },
      });
      if (result.ok) doc = result.document;
      else failed = result.error.code;
    }
    expect(failed).toBe('document-too-large');
  });
});

describe('set-translation: no-ops, unset rules and the restore boundary', () => {
  it('an edit that changes nothing keeps the entry as it is (reviewed stays reviewed)', () => {
    const d = baseDoc();
    for (const command of [
      { type: 'set-translation', locale: 'nl_NL', elementId: 'el-a' },
      { type: 'set-translation', locale: 'nl_NL', elementId: 'el-a', set: { text: 'Hallo' } },
      { type: 'set-translation', locale: 'nl_NL', elementId: 'el-a', unset: ['alt'] },
      { type: 'set-translation', locale: 'nl_NL', elementId: 'el-a', set: {}, unset: [] },
    ]) {
      const r = ok(d, command);
      expect(r.document).toBe(d);
    }
    const created = ok(d, { type: 'set-translation', locale: 'nl_NL', elementId: 'el-c', set: {} });
    expect(created.document).toBe(d);
    const explicit = ok(d, { type: 'set-translation', locale: 'nl_NL', elementId: 'el-a', status: 'translated' });
    expect(explicit.document.translations['nl_NL']?.['el-a']?.status).toBe('translated');
    const createdExplicit = ok(d, { type: 'set-translation', locale: 'nl_NL', elementId: 'el-c', status: 'draft' });
    expect(createdExplicit.document.translations['nl_NL']?.['el-c']).toEqual({ values: {}, status: 'draft' });
  });

  it('unset removes values that are there (even legacy ones) and, with a hook, refuses ids that could never be stored', () => {
    const d = baseDoc();
    const legacy: BuilderDocument = {
      ...d,
      translations: {
        ...d.translations,
        nl_NL: { 'el-a': { status: 'reviewed', values: { text: 'Hallo', level: 3 } } },
      },
    };
    const repaired = ok(
      legacy,
      { type: 'set-translation', locale: 'nl_NL', elementId: 'el-a', unset: ['level'] },
      hook,
    );
    expect(repaired.document.translations['nl_NL']?.['el-a']).toEqual({
      values: { text: 'Hallo' },
      status: 'draft',
      sourceHash: H({ text: 'Hello' }),
    });
    expect(code(d, { type: 'set-translation', locale: 'nl_NL', elementId: 'el-a', unset: ['level'] }, hook)).toBe(
      'not-translatable',
    );
    expect(code(d, { type: 'set-translation', locale: 'nl_NL', elementId: 'el-a', unset: ['alt'] }, hook)).toBe('ok');
  });

  it('restore-translation cannot smuggle in what set-translation refuses', () => {
    const d = baseDoc();
    const entry = (values: Record<string, unknown>) => ({
      type: 'restore-translation',
      locale: 'nl_NL',
      elementId: 'el-a',
      entry: { status: 'draft', values },
    });
    expect(code(d, entry({ text: 'Hallo', level: 2 }), hook)).toBe('not-translatable');
    expect(code(d, entry({ text: 'x'.repeat(30) }), hook)).toBe('invalid-translation');
    expect(code(d, entry({ text: 'Hallo' }), hook)).toBe('ok');
    // values identical to the current entry are not asked again, so undo still works after the rules became stricter
    const strict: CommandContext = {
      translationValue: () => ({ ok: false, code: 'not-translatable', message: 'nothing is translatable now' }),
    };
    expect(code(d, entry({ text: 'Hallo' }), strict)).toBe('ok');
    expect(
      code(d, {
        type: 'restore-translation',
        locale: 'nl_NL',
        elementId: 'el-a',
        entry: { status: 'orphaned', values: {} },
      }),
    ).toBe('invalid-argument');
    expect(
      code(d, {
        type: 'restore-translation',
        locale: 'nl_NL',
        elementId: 'el-a',
        entry: { status: 'draft', values: {} },
        dropStream: true,
      }),
    ).toBe('invalid-argument');
  });

  it('undoing the first translation of a locale removes the stream it created', () => {
    const d = baseDoc();
    const withoutNl: BuilderDocument = { ...d, translations: { en_US: d.translations['en_US'] ?? {} } };
    const edited = ok(withoutNl, {
      type: 'set-translation',
      locale: 'nl_NL',
      elementId: 'el-b',
      set: { text: 'Tekst' },
    });
    expect(Object.keys(edited.document.translations)).toEqual(['en_US', 'nl_NL']);
    const undone = ok(edited.document, edited.inverse);
    expect(undone.document).toEqual(withoutNl);
    expect(Object.keys(undone.document.translations)).toEqual(['en_US']);
    // a stream that already existed (even empty) is kept
    const emptyNl: BuilderDocument = { ...d, translations: { ...withoutNl.translations, nl_NL: {} } };
    const again = ok(
      ok(emptyNl, { type: 'set-translation', locale: 'nl_NL', elementId: 'el-b', set: { text: 'Tekst' } }).document,
      { type: 'restore-translation', locale: 'nl_NL', elementId: 'el-b', entry: null },
    );
    expect(again.document).toEqual(emptyNl);
  });
});

describe('set-translation with history', () => {
  it('undo restores the exact previous entry (unknown fields, hash, status) and redo reapplies', () => {
    const start = baseDoc();
    let history = createHistory(start);
    const step = (command: Command): void => {
      const r = execute(history, command, hook);
      if (!r.ok) throw new Error(r.error.message);
      history = r.history;
    };
    step({ type: 'set-translation', locale: 'en_US', elementId: 'el-a', set: { text: 'Hi' } });
    step({ type: 'set-translation', locale: 'nl_NL', elementId: 'el-b', set: { text: 'Nieuw' } });
    const after = history.document;
    for (let i = 0; i < 2; i += 1) {
      const r = undo(history, hook);
      if (!r.ok) throw new Error(r.error.message);
      history = r.history;
    }
    expect(history.document).toEqual(start);
    for (let i = 0; i < 2; i += 1) {
      const r = redo(history, hook);
      if (!r.ok) throw new Error(r.error.message);
      history = r.history;
    }
    expect(history.document).toEqual(after);
  });

  it('removing an element orphans its edited translation and undoing restores the status that set-translation left', () => {
    const edited = ok(baseDoc(), {
      type: 'set-translation',
      locale: 'nl_NL',
      elementId: 'el-a',
      set: { text: 'Nieuw' },
    });
    const removed = ok(edited.document, { type: 'remove', id: 'el-a' });
    expect(removed.document.translations['nl_NL']?.['el-a']?.status).toBe('orphaned');
    expect(
      code(removed.document, { type: 'set-translation', locale: 'nl_NL', elementId: 'el-a', set: { text: 'x' } }),
    ).toBe('element-not-found');
    const restored = ok(removed.document, removed.inverse);
    expect(restored.document.translations['nl_NL']?.['el-a']).toEqual({
      values: { text: 'Nieuw' },
      sourceHash: H({ text: 'Hello' }),
      status: 'draft',
    });
  });

  it('a seeded random mix of edits, removals, hook failures, undo and redo keeps the document valid and both directions exact', () => {
    let seed = 99;
    const next = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const pick = <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)] as T;
    const start = ((): BuilderDocument => {
      const d = baseDoc();
      return { ...d, translations: { en_US: d.translations['en_US'] ?? {} } };
    })();
    // The default limit of 200 steps would drop the oldest entries, and this test undoes everything.
    let history = createHistory(start, 10_000);
    const states: BuilderDocument[] = [history.document];
    let refused = 0;
    for (let n = 0; n < 400; n += 1) {
      const roll = next();
      let result;
      if (roll < 0.6) {
        const command: Command = {
          type: 'set-translation',
          locale: pick(['en_US', 'nl_NL']),
          elementId: pick(['el-a', 'el-b', 'el-c']),
          ...(next() < 0.7
            ? { set: { [pick(['text', 'alt', 'level', 'toString'])]: pick(['a', 'b', 'x'.repeat(30)]) } }
            : { unset: [pick(['text', 'alt', 'level'])] }),
          ...(next() < 0.3 ? { status: pick(['draft', 'translated', 'reviewed'] as const) } : {}),
        };
        result = execute(history, command, hook);
      } else if (roll < 0.7) {
        result = execute(history, { type: 'remove', id: pick(['el-a', 'el-b', 'el-c']) }, hook);
      } else if (roll < 0.85) {
        result = undo(history, hook);
      } else {
        result = redo(history, hook);
      }
      if (!result.ok) {
        refused += 1;
        continue;
      }
      history = result.history;
      expect(validateDocument(JSON.stringify(history.document)).ok, `step ${String(n)}`).toBe(true);
      states.push(history.document);
    }
    expect(refused).toBeGreaterThan(20);
    const final = history.document;
    const trail: BuilderDocument[] = [final];
    while (history.past.length > 0) {
      const r = undo(history, hook);
      if (!r.ok) throw new Error(r.error.message);
      history = r.history;
      trail.push(history.document);
    }
    expect(history.document).toEqual(start);
    // Redo exactly as many steps as were undone: the run itself may have ended in the middle of the history.
    for (let step = 1; step < trail.length; step += 1) {
      const r = redo(history, hook);
      if (!r.ok) throw new Error(r.error.message);
      history = r.history;
      expect(history.document, `redo ${String(step)}`).toEqual(trail[trail.length - 1 - step]);
    }
    expect(history.document).toEqual(final);
  });
});
