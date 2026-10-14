import { describe, expect, it } from 'vitest';
import {
  COMMAND_ERROR_CODES,
  DOCUMENT_LIMITS,
  applyCommand,
  canRedo,
  canUndo,
  measure,
  createHistory,
  execute,
  redo,
  serializeDocument,
  undo,
  validateDocument,
  type BuilderDocument,
  type Command,
  type CommandContext,
  type ElementNode,
} from '../index.ts';

const el = (id: string, type = 'blixis/box', children: ElementNode[] = []): ElementNode => ({
  id,
  type,
  props: {},
  children,
});

const baseDoc = (): BuilderDocument => {
  const result = validateDocument({
    schemaVersion: 1,
    documentId: 'doc-001',
    layoutRevision: 1,
    defaultLocale: 'en_US',
    locales: ['en_US', 'nl_NL'],
    root: [
      {
        id: 'el-a',
        type: 'blixis/box',
        props: { tag: 'section' },
        children: [el('el-a1', 'blixis/text'), el('el-a2', 'blixis/heading', [el('el-a2x', 'blixis/text')])],
      },
      el('el-b'),
      el('el-c', 'blixis/text'),
    ],
    classListVersion: 1,
    classRefs: { 'cls-001': 1, 'cls-002': 1 },
    translations: {
      en_US: {
        'el-a1': { status: 'translated', values: { text: 'Hello' } },
        'el-a2x': { status: 'reviewed', values: { text: 'Deep' } },
      },
      nl_NL: { 'el-a1': { status: 'stale', values: { text: 'Hallo' } }, 'el-a2x': { status: 'draft', values: {} } },
    },
    metadata: { updatedAt: '2026-01-01T00:00:00Z', editorVersion: '0.0.0' },
  });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.document;
};

/** Makes mutation attempts throw, so purity is proven rather than assumed. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const run = (doc: BuilderDocument, command: Command, ctx: CommandContext = {}) => applyCommand(doc, command, ctx);
const must = (doc: BuilderDocument, command: Command, ctx: CommandContext = {}) => {
  const r = run(doc, command, ctx);
  if (!r.ok) throw new Error(`${command.type} failed: ${r.error.code} ${r.error.message}`);
  return r;
};
const errorOf = (doc: BuilderDocument, command: Command, ctx: CommandContext = {}): string => {
  const r = run(doc, command, ctx);
  return r.ok ? 'ok' : r.error.code;
};
const ids = (nodes: readonly ElementNode[]): string[] => nodes.map((n) => n.id);
const valid = (doc: BuilderDocument): void => {
  const result = validateDocument(serializeDocument(doc));
  expect(result.ok, JSON.stringify(!result.ok && result.errors)).toBe(true);
};

describe('every command: correct result, exact inverse, no mutation of the input', () => {
  const cases: [string, Command][] = [
    ['insert at the root', { type: 'insert', parentId: null, index: 1, element: el('el-new') }],
    [
      'insert a subtree into a child',
      { type: 'insert', parentId: 'el-b', index: 0, element: el('el-n1', 'blixis/box', [el('el-n2', 'blixis/text')]) },
    ],
    ['remove a leaf', { type: 'remove', id: 'el-c' }],
    ['remove a subtree', { type: 'remove', id: 'el-a' }],
    ['move within the same list', { type: 'move', id: 'el-a', parentId: null, index: 2 }],
    ['move into another parent', { type: 'move', id: 'el-c', parentId: 'el-a', index: 1 }],
    ['move to the root', { type: 'move', id: 'el-a2', parentId: null, index: 0 }],
    ['set and unset props', { type: 'update-props', id: 'el-a', set: { tag: 'aside', level: 3 }, unset: [] }],
    ['unset a prop', { type: 'update-props', id: 'el-a', unset: ['tag'] }],
    [
      'add a style rule',
      { type: 'set-style-rule', id: 'el-b', selector: { mode: 'dark' }, declarations: { color: 'white' } },
    ],
    ['add a base rule', { type: 'set-style-rule', id: 'el-b', selector: {}, declarations: { color: 'black' } }],
    ['set class ids', { type: 'set-class-ids', id: 'el-b', classIds: ['cls-001', 'cls-002'] }],
  ];

  it.each(cases)('%s', (_name, command) => {
    const doc = deepFreeze(baseDoc());
    const before = structuredClone(doc);
    const first = must(doc, command);
    expect(doc).toEqual(before);
    expect(first.document).not.toBe(doc);
    valid(first.document);
    const back = must(first.document, first.inverse);
    expect(back.document).toEqual(before);
    // the inverse of the inverse re-does the original change
    expect(must(back.document, back.inverse).document).toEqual(first.document);
  });

  it('shares untouched subtrees instead of copying them', () => {
    const doc = baseDoc();
    const next = must(doc, { type: 'update-props', id: 'el-b', set: { x: 1 } }).document;
    expect(next.root[0]).toBe(doc.root[0]);
    expect(next.root[2]).toBe(doc.root[2]);
    expect(next.root[1]).not.toBe(doc.root[1]);
    const deeper = must(doc, { type: 'update-props', id: 'el-a2x', set: { x: 1 } }).document;
    expect(deeper.root[1]).toBe(doc.root[1]);
    expect(deeper.root[0]?.children[0]).toBe(doc.root[0]?.children[0]);
  });
});

describe('insert / restore', () => {
  it('places elements at exact positions', () => {
    const doc = baseDoc();
    expect(ids(must(doc, { type: 'insert', parentId: null, index: 0, element: el('el-x') }).document.root)).toEqual([
      'el-x',
      'el-a',
      'el-b',
      'el-c',
    ]);
    expect(ids(must(doc, { type: 'insert', parentId: null, index: 3, element: el('el-x') }).document.root)).toEqual([
      'el-a',
      'el-b',
      'el-c',
      'el-x',
    ]);
    expect(
      ids(
        must(doc, { type: 'insert', parentId: 'el-a', index: 1, element: el('el-x') }).document.root[0]?.children ?? [],
      ),
    ).toEqual(['el-a1', 'el-x', 'el-a2']);
  });

  it('reports the right error codes and never changes anything', () => {
    const doc = baseDoc();
    expect(errorOf(doc, { type: 'insert', parentId: 'nope', index: 0, element: el('el-x') })).toBe('parent-not-found');
    expect(errorOf(doc, { type: 'insert', parentId: null, index: 4, element: el('el-x') })).toBe('index-out-of-range');
    expect(errorOf(doc, { type: 'insert', parentId: null, index: -1, element: el('el-x') })).toBe('index-out-of-range');
    expect(errorOf(doc, { type: 'insert', parentId: null, index: 0.5, element: el('el-x') })).toBe('invalid-argument');
    expect(errorOf(doc, { type: 'insert', parentId: null, index: 0, element: el('el-b') })).toBe('duplicate-id');
    expect(
      errorOf(doc, { type: 'insert', parentId: null, index: 0, element: el('el-x', 'blixis/box', [el('el-x')]) }),
    ).toBe('duplicate-id');
    expect(
      errorOf(doc, { type: 'insert', parentId: null, index: 0, element: el('el-x', 'blixis/box', [el('el-a1')]) }),
    ).toBe('duplicate-id');
  });

  it('refuses to reuse the id of an element that still has orphaned translations', () => {
    const removed = must(baseDoc(), { type: 'remove', id: 'el-a1' }).document;
    expect(errorOf(removed, { type: 'insert', parentId: null, index: 0, element: el('el-a1', 'blixis/text') })).toBe(
      'id-has-orphaned-translations',
    );
  });

  it('enforces the depth and node limits', () => {
    let chain: ElementNode = el('el-leaf');
    for (let d = 2; d <= DOCUMENT_LIMITS.maxTreeDepth; d += 1) chain = el(`el-c${String(d)}`, 'blixis/box', [chain]);
    const doc = baseDoc();
    expect(errorOf(doc, { type: 'insert', parentId: null, index: 0, element: chain })).toBe('ok');
    expect(errorOf(doc, { type: 'insert', parentId: 'el-b', index: 0, element: chain })).toBe('depth-exceeded');
    const wide = el(
      'el-wide',
      'blixis/box',
      Array.from({ length: DOCUMENT_LIMITS.maxNodes }, (_, i) => el(`el-w${String(i).padStart(5, '0')}`)),
    );
    expect(errorOf(doc, { type: 'insert', parentId: null, index: 0, element: wide })).toBe('node-limit-exceeded');
  });

  it('asks the registry hook about every nesting inside the subtree', () => {
    const doc = baseDoc();
    const ctx: CommandContext = {
      canNest: (parent, child) => !(parent === 'blixis/text') && !(parent === null && child === 'blixis/cell'),
    };
    expect(errorOf(doc, { type: 'insert', parentId: 'el-c', index: 0, element: el('el-x') }, ctx)).toBe(
      'disallowed-parent',
    );
    expect(errorOf(doc, { type: 'insert', parentId: null, index: 0, element: el('el-x', 'blixis/cell') }, ctx)).toBe(
      'disallowed-parent',
    );
    expect(
      errorOf(
        doc,
        {
          type: 'insert',
          parentId: null,
          index: 0,
          element: el('el-x', 'blixis/box', [el('el-y', 'blixis/text', [el('el-z')])]),
        },
        ctx,
      ),
    ).toBe('disallowed-parent');
    expect(errorOf(doc, { type: 'insert', parentId: 'el-b', index: 0, element: el('el-x', 'blixis/text') }, ctx)).toBe(
      'ok',
    );
  });
});

describe('remove and translations (ADR 0004)', () => {
  it('marks translations of the whole removed subtree orphaned in every locale, and undo restores each previous status', () => {
    const doc = baseDoc();
    const removed = must(doc, { type: 'remove', id: 'el-a' });
    expect(removed.document.root.map((n) => n.id)).toEqual(['el-b', 'el-c']);
    for (const [locale, id] of [
      ['en_US', 'el-a1'],
      ['en_US', 'el-a2x'],
      ['nl_NL', 'el-a1'],
      ['nl_NL', 'el-a2x'],
    ] as const) {
      expect(removed.document.translations[locale]?.[id]?.status, `${locale}/${id}`).toBe('orphaned');
    }
    // values are kept, nothing is dropped
    expect(removed.document.translations['nl_NL']?.['el-a1']?.values).toEqual({ text: 'Hallo' });
    valid(removed.document);
    const restored = must(removed.document, removed.inverse).document;
    expect(restored).toEqual(doc);
    expect(restored.translations['nl_NL']?.['el-a1']?.status).toBe('stale');
    expect(restored.translations['en_US']?.['el-a2x']?.status).toBe('reviewed');
  });

  it('keeps already-orphaned entries orphaned when removing and restoring', () => {
    const once = must(baseDoc(), { type: 'remove', id: 'el-a1' });
    const twice = must(once.document, { type: 'remove', id: 'el-a2' });
    const undone = must(twice.document, twice.inverse);
    expect(undone.document).toEqual(once.document);
  });

  it('rejects removing something that does not exist', () => {
    expect(errorOf(baseDoc(), { type: 'remove', id: 'el-zzz' })).toBe('element-not-found');
  });
});

describe('move', () => {
  it('uses the index of the target list after the element has been taken out', () => {
    const doc = baseDoc();
    expect(ids(must(doc, { type: 'move', id: 'el-a', parentId: null, index: 2 }).document.root)).toEqual([
      'el-b',
      'el-c',
      'el-a',
    ]);
    expect(ids(must(doc, { type: 'move', id: 'el-c', parentId: null, index: 0 }).document.root)).toEqual([
      'el-c',
      'el-a',
      'el-b',
    ]);
    expect(ids(must(doc, { type: 'move', id: 'el-a', parentId: null, index: 0 }).document.root)).toEqual([
      'el-a',
      'el-b',
      'el-c',
    ]); // no-op
  });

  it('refuses cycles, missing targets and out-of-range indexes', () => {
    const doc = baseDoc();
    expect(errorOf(doc, { type: 'move', id: 'el-a', parentId: 'el-a', index: 0 })).toBe('cycle');
    expect(errorOf(doc, { type: 'move', id: 'el-a', parentId: 'el-a2x', index: 0 })).toBe('cycle');
    expect(errorOf(doc, { type: 'move', id: 'el-a', parentId: 'nope', index: 0 })).toBe('parent-not-found');
    expect(errorOf(doc, { type: 'move', id: 'nope', parentId: null, index: 0 })).toBe('element-not-found');
    expect(errorOf(doc, { type: 'move', id: 'el-a', parentId: null, index: 3 })).toBe('index-out-of-range'); // only 2 siblings remain
    expect(errorOf(doc, { type: 'move', id: 'el-c', parentId: 'el-b', index: 1 })).toBe('index-out-of-range');
  });

  it('enforces depth and registry rules for the new position, and keeps translations untouched', () => {
    let chain: ElementNode = el('el-leaf');
    for (let d = 2; d < DOCUMENT_LIMITS.maxTreeDepth; d += 1) chain = el(`el-c${String(d)}`, 'blixis/box', [chain]);
    const doc = must(baseDoc(), { type: 'insert', parentId: null, index: 0, element: chain }).document;
    expect(errorOf(doc, { type: 'move', id: 'el-a2', parentId: 'el-leaf', index: 0 })).toBe('depth-exceeded');
    expect(
      errorOf(
        baseDoc(),
        { type: 'move', id: 'el-b', parentId: 'el-c', index: 0 },
        { canNest: (p) => p !== 'blixis/text' },
      ),
    ).toBe('disallowed-parent');
    expect(must(baseDoc(), { type: 'move', id: 'el-a', parentId: 'el-b', index: 0 }).document.translations).toEqual(
      baseDoc().translations,
    );
  });
});

describe('update-props', () => {
  it('sets, replaces and unsets properties, and the inverse restores previous values and absences', () => {
    const doc = baseDoc();
    const r = must(doc, {
      type: 'update-props',
      id: 'el-a',
      set: { tag: 'aside', fresh: { a: [1, null] } },
      unset: [],
    });
    expect(r.document.root[0]?.props).toEqual({ tag: 'aside', fresh: { a: [1, null] } });
    expect(r.inverse).toEqual({ type: 'update-props', id: 'el-a', set: { tag: 'section' }, unset: ['fresh'] });
    expect(must(r.document, r.inverse).document).toEqual(doc);
    expect(must(doc, { type: 'update-props', id: 'el-a', unset: ['absent'] }).document.root[0]?.props).toEqual({
      tag: 'section',
    });
  });

  it('rejects bad keys and values with invalid-argument', () => {
    const doc = baseDoc();
    for (const command of [
      { type: 'update-props', id: 'el-a', set: { 'Bad-Key': 1 } },
      { type: 'update-props', id: 'el-a', set: { constructor: 1 } },
      { type: 'update-props', id: 'el-a', set: { x: 1.5 } },
      { type: 'update-props', id: 'el-a', set: { x: 'é' } },
      { type: 'update-props', id: 'el-a', set: { x: 1 }, unset: ['x'] },
      { type: 'update-props', id: 'el-a', unset: ['__proto__'] },
    ] satisfies Command[]) {
      expect(errorOf(doc, command), JSON.stringify(command)).toBe('invalid-argument');
    }
    expect(errorOf(doc, { type: 'update-props', id: 'nope', set: { x: 1 } })).toBe('element-not-found');
  });
});

describe('style rules', () => {
  it('adds, replaces and removes rules by selector, with exact inverses and positions', () => {
    const doc = baseDoc();
    const a = must(doc, {
      type: 'set-style-rule',
      id: 'el-b',
      selector: { mode: 'dark' },
      declarations: { color: 'white' },
    });
    const b = must(a.document, {
      type: 'set-style-rule',
      id: 'el-b',
      selector: { breakpoint: 'mobile', mode: 'dark' },
      declarations: { color: 'lightgray' },
    });
    const c = must(b.document, {
      type: 'set-style-rule',
      id: 'el-b',
      selector: { mode: 'dark' },
      declarations: { color: 'silver' },
    }); // replace in place
    expect(c.document.root[1]?.style).toEqual([
      { mode: 'dark', declarations: { color: 'silver' } },
      { breakpoint: 'mobile', mode: 'dark', declarations: { color: 'lightgray' } },
    ]);
    const removed = must(c.document, {
      type: 'set-style-rule',
      id: 'el-b',
      selector: { mode: 'dark' },
      declarations: null,
    });
    expect(removed.document.root[1]?.style).toEqual([
      { breakpoint: 'mobile', mode: 'dark', declarations: { color: 'lightgray' } },
    ]);
    expect(must(removed.document, removed.inverse).document).toEqual(c.document); // re-inserted at index 0, not appended
    valid(c.document);
  });

  it('never creates two rules with the same selector', () => {
    let doc = baseDoc();
    for (const color of ['red', 'green', 'blue'])
      doc = must(doc, {
        type: 'set-style-rule',
        id: 'el-b',
        selector: { state: 'hover' },
        declarations: { color },
      }).document;
    expect(doc.root[1]?.style).toHaveLength(1);
    valid(doc);
  });

  it('keeps an explicitly empty style list distinct from no style list', () => {
    const withEmpty = must(baseDoc(), { type: 'update-props', id: 'el-b', set: { x: 1 } }).document;
    const seeded: BuilderDocument = {
      ...withEmpty,
      root: withEmpty.root.map((n) => (n.id === 'el-b' ? { ...n, style: [] } : n)),
    };
    const added = must(seeded, { type: 'set-style-rule', id: 'el-b', selector: {}, declarations: { color: 'red' } });
    expect(must(added.document, added.inverse).document).toEqual(seeded);
    const none = must(withEmpty, { type: 'set-style-rule', id: 'el-b', selector: {}, declarations: { color: 'red' } });
    const back = must(none.document, none.inverse).document;
    expect(back).toEqual(withEmpty);
    expect('style' in (back.root[1] ?? {})).toBe(false);
  });

  it('removing a rule that does not exist is a harmless no-op with a matching inverse', () => {
    const doc = baseDoc();
    const r = must(doc, { type: 'set-style-rule', id: 'el-b', selector: { mode: 'dark' }, declarations: null });
    expect(r.document).toEqual(doc);
  });

  it('validates selectors and declarations', () => {
    const doc = baseDoc();
    for (const command of [
      { type: 'set-style-rule', id: 'el-b', selector: { breakpoint: 'base' }, declarations: { color: 'red' } },
      { type: 'set-style-rule', id: 'el-b', selector: { mode: 'sepia' as 'dark' }, declarations: { color: 'red' } },
      { type: 'set-style-rule', id: 'el-b', selector: {}, declarations: { Color: 'red' } },
      { type: 'set-style-rule', id: 'el-b', selector: {}, declarations: { 'z-index': 1.5 } },
    ] satisfies Command[]) {
      expect(errorOf(doc, command), JSON.stringify(command)).toBe('invalid-argument');
    }
    expect(
      errorOf(doc, { type: 'set-style-rule', id: 'el-b', selector: {}, declarations: { color: 'red' }, index: 5 }),
    ).toBe('index-out-of-range');
    expect(errorOf(doc, { type: 'set-style-rule', id: 'nope', selector: {}, declarations: null })).toBe(
      'element-not-found',
    );
  });
});

describe('class ids', () => {
  it('sets and clears class ids, and only for classes the document references', () => {
    const doc = baseDoc();
    const r = must(doc, { type: 'set-class-ids', id: 'el-b', classIds: ['cls-001'] });
    expect(r.document.root[1]?.classIds).toEqual(['cls-001']);
    expect(must(r.document, r.inverse).document).toEqual(doc);
    expect(
      'classIds' in (must(r.document, { type: 'set-class-ids', id: 'el-b', classIds: null }).document.root[1] ?? {}),
    ).toBe(false);
    expect(errorOf(doc, { type: 'set-class-ids', id: 'el-b', classIds: ['cls-999'] })).toBe('invalid-argument');
    expect(errorOf(doc, { type: 'set-class-ids', id: 'el-b', classIds: ['cls-001', 'cls-001'] })).toBe(
      'invalid-argument',
    );
    expect(errorOf(doc, { type: 'set-class-ids', id: 'el-b', classIds: ['Bad Id'] })).toBe('invalid-argument');
    valid(r.document);
  });
});

describe('history', () => {
  const insert = (id: string, index = 0): Command => ({ type: 'insert', parentId: null, index, element: el(id) });

  it('executes, undoes and redoes, with canUndo / canRedo', () => {
    let h = createHistory(baseDoc());
    expect([canUndo(h), canRedo(h)]).toEqual([false, false]);
    for (const id of ['el-n1', 'el-n2', 'el-n3']) {
      const r = execute(h, insert(id));
      if (!r.ok) throw new Error(r.error.message);
      h = r.history;
    }
    expect(ids(h.document.root)).toEqual(['el-n3', 'el-n2', 'el-n1', 'el-a', 'el-b', 'el-c']);
    const u = undo(h);
    if (!u.ok) throw new Error('undo failed');
    expect(ids(u.history.document.root)).toEqual(['el-n2', 'el-n1', 'el-a', 'el-b', 'el-c']);
    expect([canUndo(u.history), canRedo(u.history)]).toEqual([true, true]);
    const r2 = redo(u.history);
    if (!r2.ok) throw new Error('redo failed');
    expect(r2.history.document).toEqual(h.document);
  });

  it('a new command clears the redo stack; a failing command changes nothing', () => {
    let h = createHistory(baseDoc());
    const first = execute(h, insert('el-n1'));
    if (!first.ok) throw new Error('execute failed');
    const undone = undo(first.history);
    if (!undone.ok) throw new Error('undo failed');
    expect(canRedo(undone.history)).toBe(true);
    const again = execute(undone.history, insert('el-n2'));
    if (!again.ok) throw new Error('execute failed');
    expect(canRedo(again.history)).toBe(false);
    h = again.history;
    const bad = execute(h, { type: 'remove', id: 'nope' });
    expect(bad.ok).toBe(false);
    expect(h.past).toHaveLength(1);
  });

  it('undo and redo with nothing to do are no-ops', () => {
    const h = createHistory(baseDoc());
    expect(undo(h)).toEqual({ ok: true, history: h });
    expect(redo(h)).toEqual({ ok: true, history: h });
  });

  it('keeps at most `limit` entries, dropping the oldest', () => {
    let h = createHistory(baseDoc(), 3);
    for (let i = 0; i < 6; i += 1) {
      const r = execute(h, insert(`el-n${String(i)}`));
      if (!r.ok) throw new Error('execute failed');
      h = r.history;
    }
    expect(h.past).toHaveLength(3);
    let steps = 0;
    while (canUndo(h)) {
      const u = undo(h);
      if (!u.ok) throw new Error('undo failed');
      h = u.history;
      steps += 1;
    }
    expect(steps).toBe(3);
    expect(ids(h.document.root)).toEqual(['el-n2', 'el-n1', 'el-n0', 'el-a', 'el-b', 'el-c']);
  });
});

describe('command error codes', () => {
  it('are a stable documented list', () => {
    expect([...COMMAND_ERROR_CODES]).toEqual([
      'element-not-found',
      'parent-not-found',
      'duplicate-id',
      'id-has-orphaned-translations',
      'index-out-of-range',
      'cycle',
      'depth-exceeded',
      'node-limit-exceeded',
      'document-too-large',
      'disallowed-parent',
      'invalid-argument',
      'stale-restore',
      'locale-not-found',
      'not-translatable',
      'invalid-translation',
    ]);
  });
});

/** Seeded pseudo-random numbers (mulberry32), so a failing sequence can be replayed from its seed. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const coverage = new Map<string, number>();
const seen = (kind: string): void => {
  coverage.set(kind, (coverage.get(kind) ?? 0) + 1);
};

describe('random command sequences keep every invariant', () => {
  const allIds = (nodes: readonly ElementNode[]): string[] => nodes.flatMap((n) => [n.id, ...allIds(n.children)]);
  const ctx: CommandContext = { canNest: (parent) => parent !== 'blixis/text' };

  it.each(Array.from({ length: 60 }, (_, i) => i + 1))('seed %i', (seed) => {
    const random = rng(seed);
    const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)] as T;
    let counter = 0;
    let h = createHistory(baseDoc(), 500);
    const initial = h.document;
    const snapshots: BuilderDocument[] = [h.document];
    const types = ['blixis/box', 'blixis/text', 'blixis/heading'];

    for (let step = 0; step < 40; step += 1) {
      const known = allIds(h.document.root);
      const anyId = (): string => (random() < 0.1 ? 'el-missing' : pick(known));
      const parent = (): string | null => (random() < 0.3 || known.length === 0 ? null : anyId());
      const roll = random();
      let command: Command;
      if (roll < 0.25) {
        counter += 1;
        const tag = `el-k${String(seed)}-${String(counter)}`;
        const kids =
          random() < 0.4
            ? [
                el(
                  `${tag}x`,
                  'blixis/box',
                  random() < 0.5
                    ? [el(`${tag}y`, pick(types), random() < 0.5 ? [el(`${tag}z`, 'blixis/box')] : [])]
                    : [],
                ),
              ]
            : [];
        command = {
          type: 'insert',
          parentId: parent(),
          index: Math.floor(random() * 4),
          element: el(`el-k${String(seed)}-${String(counter)}`, pick(types), kids),
        };
      } else if (roll < 0.4) command = { type: 'remove', id: anyId() };
      else if (roll < 0.6) command = { type: 'move', id: anyId(), parentId: parent(), index: Math.floor(random() * 4) };
      else if (roll < 0.75)
        command =
          random() < 0.7
            ? { type: 'update-props', id: anyId(), set: { k: Math.floor(random() * 5) } }
            : { type: 'update-props', id: anyId(), unset: ['k'] };
      else if (roll < 0.9)
        command = {
          type: 'set-style-rule',
          id: anyId(),
          selector: pick([{}, { mode: 'dark' as const }, { breakpoint: 'mobile' }, { state: 'hover' as const }]),
          declarations: random() < 0.3 ? null : { color: pick(['red', 'blue']) },
        };
      else
        command = {
          type: 'set-class-ids',
          id: anyId(),
          classIds: random() < 0.4 ? null : [pick(['cls-001', 'cls-002'])],
        };

      const before = h.document;
      const result = execute(h, command, ctx);
      if (!result.ok) {
        expect(COMMAND_ERROR_CODES).toContain(result.error.code);
        continue; // a rejected command changes nothing
      }
      if (result.history.document === before) expect(result.history.past.at(-1)?.command.type).toBe('set-style-rule'); // the only possible no-op
      valid(result.history.document); // unique ids, depth, orphan rules, class refs ... all still hold
      seen(`command:${command.type}`);
      seen(`inverse:${result.history.past[result.history.past.length - 1]?.inverse.type ?? 'none'}`);
      if (
        Object.values(result.history.document.translations).some((stream) =>
          Object.values(stream).some((e) => e.status === 'orphaned'),
        )
      )
        seen('state:orphaned-entries');
      if (measure(result.history.document.root).depth >= 3) seen('state:deep-tree');
      const entry = result.history.past[result.history.past.length - 1];
      if (entry === undefined) throw new Error('missing history entry');
      expect(must(result.history.document, entry.inverse).document).toEqual(before); // exact inverse
      h = result.history;
      snapshots.push(h.document);
    }

    // Undo everything: every intermediate state is reproduced exactly, down to the starting document.
    for (let i = snapshots.length - 2; i >= 0; i -= 1) {
      const u = undo(h, ctx);
      if (!u.ok) throw new Error(`undo failed: ${u.error.message}`);
      h = u.history;
      expect(h.document, `undo to state ${String(i)}`).toEqual(snapshots[i]);
    }
    expect(h.document).toEqual(initial);
    // Redo everything: the same states come back in order.
    for (let i = 1; i < snapshots.length; i += 1) {
      const r = redo(h, ctx);
      if (!r.ok) throw new Error(`redo failed: ${r.error.message}`);
      h = r.history;
      expect(h.document, `redo to state ${String(i)}`).toEqual(snapshots[i]);
    }
  });
});

describe('limits and payload checks (a command can never produce a document validateDocument rejects)', () => {
  const insertEl = (element: unknown): unknown => ({ type: 'insert', parentId: null, index: 0, element });
  const parseJson = (text: string): unknown => JSON.parse(text) as unknown;

  it('validates the inserted subtree against the element schema, class references and value rules', () => {
    const doc = baseDoc();
    const rules = Array.from({ length: 257 }, (_, i) => ({ breakpoint: `bp${String(i)}`, declarations: {} }));
    expect(errorOf(doc, insertEl({ ...el('el-x'), style: rules }) as Command)).toBe('invalid-argument');
    expect(errorOf(doc, insertEl({ ...el('el-x'), classIds: ['cls-999'] }) as Command)).toBe('invalid-argument');
    expect(errorOf(doc, insertEl({ ...el('el-x'), props: { ratio: 0.5 } }) as Command)).toBe('invalid-argument');
    expect(errorOf(doc, insertEl({ ...el('el-x'), type: 'nope' }) as Command)).toBe('invalid-argument');
    expect(
      errorOf(
        doc,
        insertEl(
          parseJson('{"id":"el-x","type":"blixis/box","props":{"opts":{"__proto__":1}},"children":[]}'),
        ) as Command,
      ),
    ).toBe('invalid-argument');
    expect(
      errorOf(
        doc,
        insertEl(parseJson('{"id":"el-x","type":"blixis/box","props":{},"children":[],"constructor":1}')) as Command,
      ),
    ).toBe('invalid-argument');
    expect(errorOf(doc, insertEl({ ...el('el-x'), classIds: ['cls-001'] }) as Command)).toBe('ok');
  });

  it('refuses a result larger than the document byte limit, even when each command alone is small enough', () => {
    const big = (id: string): ElementNode => ({
      id,
      type: 'blixis/text',
      props: { text: 'x'.repeat(1_200_000) },
      children: [],
    });
    const first = must(baseDoc(), { type: 'insert', parentId: null, index: 0, element: big('el-big-1') });
    expect(errorOf(first.document, { type: 'insert', parentId: null, index: 0, element: big('el-big-2') })).toBe(
      'document-too-large',
    );
    expect(
      errorOf(baseDoc(), {
        type: 'insert',
        parentId: null,
        index: 0,
        element: { ...big('el-huge'), props: { text: 'x'.repeat(2_200_000) } },
      }),
    ).toBe('invalid-argument');
    expect(errorOf(first.document, { type: 'update-props', id: 'el-b', set: { text: 'y'.repeat(1_200_000) } })).toBe(
      'document-too-large',
    );
  });

  it('applies the same value rules to update-props payloads', () => {
    const doc = baseDoc();
    let deep: unknown = 1;
    for (let i = 0; i < 200; i += 1) deep = [deep];
    expect(errorOf(doc, { type: 'update-props', id: 'el-a', set: { x: deep } } as Command)).toBe('invalid-argument');
    expect(errorOf(doc, parseJson('{"type":"update-props","id":"el-a","set":{"x":{"__proto__":1}}}') as Command)).toBe(
      'invalid-argument',
    );
    expect(
      errorOf(doc, parseJson('{"type":"update-props","id":"el-a","set":{"x":{"constructor":1}}}') as Command),
    ).toBe('invalid-argument');
  });

  it('allows at most 256 style rules per element', () => {
    let doc = baseDoc();
    for (let i = 0; i < 256; i += 1)
      doc = must(doc, {
        type: 'set-style-rule',
        id: 'el-b',
        selector: { breakpoint: `bp${String(i)}` },
        declarations: { color: 'red' },
      }).document;
    expect(
      errorOf(doc, {
        type: 'set-style-rule',
        id: 'el-b',
        selector: { breakpoint: 'one-more' },
        declarations: { color: 'red' },
      }),
    ).toBe('invalid-argument');
    expect(
      errorOf(doc, {
        type: 'set-style-rule',
        id: 'el-b',
        selector: { breakpoint: 'bp5' },
        declarations: { color: 'blue' },
      }),
    ).toBe('ok'); // replacing is fine
    valid(doc);
  });

  it('property ids that exist on every object prototype (toString, valueOf, hasOwnProperty) work, and undo works', () => {
    const doc = baseDoc();
    for (const key of ['toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf']) {
      const set = must(doc, { type: 'update-props', id: 'el-b', set: { [key]: 'mine' } });
      expect(set.document.root[1]?.props).toEqual({ [key]: 'mine' });
      expect(must(set.document, set.inverse).document).toEqual(doc);
      const replaced = must(set.document, { type: 'update-props', id: 'el-b', set: { [key]: 'again' } });
      expect(must(replaced.document, replaced.inverse).document).toEqual(set.document);
      expect(must(set.document, { type: 'update-props', id: 'el-b', unset: [key] }).document).toEqual(doc);
      expect(must(doc, { type: 'update-props', id: 'el-b', unset: [key] }).document).toEqual(doc); // absent: harmless
      expect(errorOf(doc, { type: 'update-props', id: 'el-b', set: { [key]: 1 }, unset: [key] })).toBe(
        'invalid-argument',
      );
    }
  });
});

describe('unknown fields survive removal and undo', () => {
  it('a removed style rule comes back with every field, at its position', () => {
    const base = baseDoc();
    const rule = { mode: 'dark', declarations: { color: 'white' }, future: { keep: [1, 2] } };
    const withRule: BuilderDocument = {
      ...base,
      root: base.root.map((n) =>
        n.id === 'el-b' ? { ...n, style: [{ declarations: { color: 'black' } }, rule as never] } : n,
      ),
    };
    const removed = must(withRule, {
      type: 'set-style-rule',
      id: 'el-b',
      selector: { mode: 'dark' },
      declarations: null,
    });
    expect(removed.inverse.type).toBe('restore-style-rule');
    expect(must(removed.document, removed.inverse).document).toEqual(withRule);
    expect(
      must(withRule, {
        type: 'set-style-rule',
        id: 'el-b',
        selector: { mode: 'dark' },
        declarations: { color: 'silver' },
      }).document.root[1]?.style?.[1],
    ).toEqual({ ...rule, declarations: { color: 'silver' } });
    valid(withRule);
  });

  it('restore-style-rule refuses duplicates and bad positions', () => {
    const doc = baseDoc();
    const added = must(doc, {
      type: 'set-style-rule',
      id: 'el-b',
      selector: {},
      declarations: { color: 'red' },
    }).document;
    expect(
      errorOf(added, { type: 'restore-style-rule', id: 'el-b', index: 0, rule: { declarations: { color: 'x' } } }),
    ).toBe('invalid-argument');
    expect(
      errorOf(doc, { type: 'restore-style-rule', id: 'el-b', index: 3, rule: { mode: 'dark', declarations: {} } }),
    ).toBe('index-out-of-range');
  });
});

describe("commands are copied: later mutation of the caller's objects changes nothing", () => {
  it('mutating an inserted element after execute does not alter the document, the history or redo', () => {
    const element: ElementNode = { id: 'el-mut', type: 'blixis/box', props: { x: 1 }, children: [] };
    const h0 = createHistory(baseDoc());
    const r = execute(h0, { type: 'insert', parentId: null, index: 0, element });
    if (!r.ok) throw new Error(r.error.message);
    const expected = structuredClone(r.history.document);
    element.props['x'] = 99;
    element.children.push(el('el-sneaky'));
    element.id = 'el-renamed';
    expect(r.history.document).toEqual(expected);
    const u = undo(r.history);
    const again = u.ok ? redo(u.history) : u;
    expect(again.ok && again.history.document).toEqual(expected);
  });

  it('mutating a set value or a command after execute does not alter the result either', () => {
    const value = { list: [1, 2] };
    const command = { type: 'update-props' as const, id: 'el-b', set: { v: value } };
    const r = execute(createHistory(baseDoc()), command);
    if (!r.ok) throw new Error(r.error.message);
    const expected = structuredClone(r.history.document);
    value.list.push(3);
    command.set.v = { list: [] };
    expect(r.history.document).toEqual(expected);
    const u = undo(r.history);
    const again = u.ok ? redo(u.history) : u;
    expect(again.ok && again.history.document).toEqual(expected);
  });
});

describe('direct restore is checked against the current state', () => {
  const removed = (): { doc: BuilderDocument; restore: Extract<Command, { type: 'restore' }> } => {
    const r = must(baseDoc(), { type: 'remove', id: 'el-a' });
    if (r.inverse.type !== 'restore') throw new Error('expected a restore');
    return { doc: r.document, restore: r.inverse };
  };

  it('accepts the exact inverse of remove', () => {
    const { doc, restore } = removed();
    expect(must(doc, restore).document).toEqual(baseDoc());
  });

  it('rejects status records for ids outside the subtree, for entries that are not orphaned, duplicates and the orphaned status', () => {
    const { doc, restore } = removed();
    const withStatuses = (statuses: Extract<Command, { type: 'restore' }>['statuses']): Command => ({
      ...restore,
      statuses,
    });
    expect(errorOf(doc, withStatuses([{ locale: 'en_US', elementId: 'el-b', status: 'translated' }]))).toBe(
      'stale-restore',
    );
    expect(
      errorOf(
        doc,
        withStatuses([
          { locale: 'en_US', elementId: 'el-a1', status: 'translated' },
          { locale: 'en_US', elementId: 'el-a1', status: 'draft' },
        ]),
      ),
    ).toBe('invalid-argument');
    expect(errorOf(doc, withStatuses([{ locale: 'en_US', elementId: 'el-a1', status: 'orphaned' }]))).toBe(
      'invalid-argument',
    );
    expect(errorOf(doc, withStatuses([{ locale: 'fr_FR', elementId: 'el-a1', status: 'draft' }]))).toBe(
      'stale-restore',
    );
    // an entry that was meanwhile edited back to a live status is not restorable
    const edited: BuilderDocument = {
      ...doc,
      translations: {
        ...doc.translations,
        en_US: { ...doc.translations['en_US'], 'el-a1': { status: 'draft', values: {} } },
      },
    };
    expect(errorOf(edited, restore)).toBe('stale-restore');
    expect(errorOf(doc, withStatuses([{ locale: 'en_US', elementId: 'el-a1', status: 'nonsense' }]))).toBe(
      'invalid-argument',
    );
  });

  it('replaying a restore twice fails the second time', () => {
    const { doc, restore } = removed();
    const once = must(doc, restore).document;
    expect(errorOf(once, restore)).toBe('duplicate-id');
  });
});

describe('runtime robustness: nothing throws, nothing changes', () => {
  const doc = baseDoc();
  it.each([
    ['null', null],
    ['a string', 'insert'],
    ['an unknown type', { type: 'explode', id: 'el-a' }],
    ['a missing id', { type: 'remove' }],
    ['an extra field', { type: 'remove', id: 'el-a', force: true }],
    ['a wrong id type', { type: 'remove', id: 42 }],
    ['an array', []],
    ['a getter', Object.defineProperty({ type: 'remove' }, 'id', { enumerable: true, get: () => 'el-a' })],
    [
      'a throwing getter',
      Object.defineProperty({ type: 'remove' }, 'id', {
        enumerable: true,
        get: () => {
          throw new Error('boom');
        },
      }),
    ],
    [
      'a Proxy that throws',
      new Proxy(
        {},
        {
          ownKeys: () => {
            throw new Error('trap');
          },
        },
      ),
    ],
    [
      'a class instance',
      new (class Remove {
        type = 'remove';
        id = 'el-a';
      })(),
    ],
  ])('rejects %s', (_name, input) => {
    let result: ReturnType<typeof applyCommand> | undefined;
    expect(() => {
      result = applyCommand(doc, input);
    }).not.toThrow();
    expect(result?.ok).toBe(false);
    if (result?.ok === false) expect(COMMAND_ERROR_CODES).toContain(result.error.code);
  });

  it('turns a throwing canNest hook into a failed command', () => {
    const ctx: CommandContext = {
      canNest: () => {
        throw new Error('registry offline');
      },
    };
    expect(errorOf(doc, { type: 'insert', parentId: null, index: 0, element: el('el-x') }, ctx)).toBe(
      'invalid-argument',
    );
  });
});

describe('history robustness', () => {
  it.each([[0], [-1], [1.5], [Number.NaN], [Infinity]])('rejects the limit %s', (limit) => {
    expect(() => createHistory(baseDoc(), limit)).toThrow(RangeError);
  });

  it('a failed undo returns the error and leaves the history untouched; the same undo works once the cause is gone', () => {
    const base = createHistory(baseDoc());
    const removed = execute(base, { type: 'remove', id: 'el-c' });
    if (!removed.ok) throw new Error('remove failed');
    const blocked = undo(removed.history, { canNest: () => false });
    expect(blocked.ok).toBe(false);
    expect(!blocked.ok && blocked.error.code).toBe('disallowed-parent');
    expect(removed.history.past).toHaveLength(1);
    const fine = undo(removed.history);
    expect(fine.ok && fine.history.document).toEqual(baseDoc());
  });
});

describe('performance smoke (5 000 elements)', () => {
  it('100 property edits on a maximum-size document take well under the budget', () => {
    const root = Array.from({ length: DOCUMENT_LIMITS.maxNodes }, (_, i) =>
      el(`el-p${String(i).padStart(5, '0')}`, 'blixis/text'),
    );
    const big: BuilderDocument = { ...baseDoc(), root, translations: { en_US: {}, nl_NL: {} } };
    let doc = big;
    const started = performance.now();
    for (let i = 0; i < 100; i += 1)
      doc = must(doc, {
        type: 'update-props',
        id: `el-p${String(4_900 + (i % 99)).padStart(5, '0')}`,
        set: { n: i },
      }).document;
    const perCommand = (performance.now() - started) / 100;
    // Generous bound so slow CI machines do not flake; the real figure is printed for the record in the PR.
    expect(perCommand).toBeLessThan(40);
  });
});

describe('the random sequences cover what they claim to', () => {
  it('every command type, both kinds of restore, orphaned entries and deep trees were exercised', () => {
    for (const kind of ['insert', 'remove', 'move', 'update-props', 'set-style-rule', 'set-class-ids']) {
      expect(coverage.get(`command:${kind}`) ?? 0, `command:${kind}`).toBeGreaterThan(0);
    }
    for (const kind of [
      'remove',
      'restore',
      'restore-style-rule',
      'move',
      'update-props',
      'set-style-rule',
      'set-class-ids',
    ]) {
      expect(coverage.get(`inverse:${kind}`) ?? 0, `inverse:${kind}`).toBeGreaterThan(0);
    }
    expect(coverage.get('state:orphaned-entries') ?? 0).toBeGreaterThan(0);
    expect(coverage.get('state:deep-tree') ?? 0).toBeGreaterThan(0);
  });
});
