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
    expect(nl.document.translations['nl_NL']?.['el-b']).toEqual({ values: { text: 'Tekst' }, status: 'draft' });
    const en = ok(baseDoc(), { type: 'set-translation', locale: 'en_US', elementId: 'el-c', set: { alt: 'Logo' } });
    expect(en.document.translations['en_US']?.['el-c']).toEqual({ values: { alt: 'Logo' }, status: 'translated' });
  });

  it('merges into an entry, keeps unknown fields and the source hash, and leaves review unless a status is given', () => {
    const merged = ok(baseDoc(), { type: 'set-translation', locale: 'nl_NL', elementId: 'el-a', set: { alt: 'Een' } });
    expect(merged.document.translations['nl_NL']?.['el-a']).toEqual({
      values: { text: 'Hallo', alt: 'Een' },
      sourceHash: 'abcdef12',
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
      sourceHash: 'abcdef12',
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
      sourceHash: 'abcdef12',
      status: 'draft',
    });
  });

  it('a seeded random mix of edits, removals and undo keeps the document valid and undo exact', () => {
    let seed = 99;
    const next = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const pick = <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)] as T;
    let history = createHistory(baseDoc());
    const snapshots: BuilderDocument[] = [history.document];
    for (let n = 0; n < 300; n += 1) {
      const roll = next();
      let result;
      if (roll < 0.75) {
        const command: Command = {
          type: 'set-translation',
          locale: pick(['en_US', 'nl_NL']),
          elementId: pick(['el-a', 'el-b', 'el-c']),
          ...(next() < 0.7
            ? { set: { [pick(['text', 'alt', 'toString'])]: pick(['a', 'b', 'c']) } }
            : { unset: [pick(['text', 'alt'])] }),
          ...(next() < 0.3 ? { status: pick(['draft', 'translated', 'reviewed'] as const) } : {}),
        };
        result = execute(history, command, {});
      } else if (roll < 0.9) {
        result = undo(history, {});
      } else {
        result = redo(history, {});
      }
      if (!result.ok) continue;
      history = result.history;
      const valid = validateDocument(JSON.stringify(history.document));
      expect(valid.ok, `step ${String(n)}`).toBe(true);
      snapshots.push(history.document);
    }
    while (history.past.length > 0) {
      const r = undo(history, {});
      if (!r.ok) throw new Error(r.error.message);
      history = r.history;
    }
    expect(history.document).toEqual(snapshots[0]);
  });
});
