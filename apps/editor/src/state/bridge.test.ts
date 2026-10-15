import {
  createHistory,
  execute,
  redo as coreRedo,
  undo as coreUndo,
  type BuilderDocument,
  type Command,
  type ElementNode,
} from '@blixis/wp-core';
import { createCoreRegistry } from '@blixis/wp-element-registry';
import { describe, expect, it } from 'vitest';
import { createEditorStore } from './index';
import { makeBootstrap } from '../test/fixtures';
import {
  documentOf,
  el,
  fakeClient,
  makeDocument,
  makeLoadedStore,
  makeStore,
  memoryStorage,
  ok,
  streamsOf,
} from '../test/state-helpers';
import { COALESCE_WINDOW_MS, computeDirty, type DocumentEvent, type EditorState } from './index';

const level = (n: number): Command => ({ type: 'update-props', id: 'el-heading-1', set: { level: n } });

describe('command bridge: dispatch', () => {
  it('applies a command and replaces document, history and flags together', async () => {
    const { store } = await makeLoadedStore();
    const before = store.getState();
    const result = store.getState().dispatch(level(3));
    expect(result).toEqual({ ok: true, command: level(3) });
    const after = store.getState();
    expect(after.document).not.toBe(before.document);
    expect(after.document?.root[0]?.children[0]?.children[0]?.props).toEqual({ level: 3 });
    expect(after.history?.document).toBe(after.document);
    expect(after.canUndo).toBe(true);
    expect(after.canRedo).toBe(false);
    expect(before.document?.root[0]?.children[0]?.children[0]?.props).toEqual({ level: 2 }); // the old document is untouched
    expect(after.savedDocument).toBe(before.savedDocument);
  });

  it('never mutates a command and stores its own inert copy', async () => {
    const { store } = await makeLoadedStore();
    const command = { type: 'update-props', id: 'el-heading-1', set: { level: 3 } } satisfies Command;
    const frozen = Object.freeze({ ...command, set: Object.freeze({ ...command.set }) });
    const result = store.getState().dispatch(frozen);
    expect(result.ok).toBe(true);
    expect(frozen).toEqual(command);
    (command.set as Record<string, number>)['level'] = 6; // mutating the caller's object afterwards changes nothing
    store.getState().undo();
    store.getState().redo();
    expect(store.getState().document?.root[0]?.children[0]?.children[0]?.props).toEqual({ level: 3 });
  });

  it.each([
    ['unknown element', { type: 'remove', id: 'el-nope-1' }, 'element-not-found'],
    ['unknown type', { type: 'explode' }, 'invalid-argument'],
    ['not an object', 'remove', 'invalid-argument'],
    [
      'disallowed parent',
      { type: 'move', id: 'el-section-2', parentId: 'el-container-1', index: 0 },
      'disallowed-parent',
    ],
    [
      'bad translation',
      { type: 'set-translation', locale: 'en_US', elementId: 'el-heading-1', set: { level: 1 } },
      'not-translatable',
    ],
    [
      'bad locale',
      { type: 'set-translation', locale: 'xx_XX', elementId: 'el-heading-1', set: { text: 'x' } },
      'locale-not-found',
    ],
  ])('a failing command (%s) changes nothing and notifies nobody', async (_, command, code) => {
    const { store } = await makeLoadedStore();
    const events: DocumentEvent[] = [];
    store.getState().subscribe((event) => events.push(event));
    let updates = 0;
    store.subscribe(() => {
      updates += 1;
    });
    const before = store.getState();
    const result = store.getState().dispatch(command);
    expect(result).toMatchObject({ ok: false, error: { code } });
    expect(store.getState()).toBe(before);
    expect(updates).toBe(0);
    expect(events).toEqual([]);
  });

  it('refuses commands before a document is loaded, while reloading, and when editing is locked', async () => {
    const idle = makeStore();
    expect(idle.store.getState().dispatch(level(3))).toMatchObject({ ok: false, error: { code: 'not-ready' } });
    expect(idle.store.getState().undo()).toMatchObject({ ok: false, error: { code: 'not-ready' } });
    const locked = makeStore({ bootstrap: { editingEnabled: false } });
    await locked.store.getState().loadDocument();
    expect(locked.store.getState().dispatch(level(3))).toMatchObject({ ok: false, error: { code: 'read-only' } });
    expect(locked.store.getState().redo()).toMatchObject({ ok: false, error: { code: 'read-only' } });
    const loaded = await makeLoadedStore();
    const reload = loaded.store.getState().loadDocument();
    expect(loaded.store.getState().dispatch(level(3))).toMatchObject({ ok: false, error: { code: 'not-ready' } });
    await reload;
    expect(loaded.store.getState().dispatch(level(3)).ok).toBe(true);
  });

  it('survives commands that throw inside registry hooks (invalid-argument)', async () => {
    const registry = createCoreRegistry();
    const made = makeStore({
      deps: {
        registry: Object.assign(registry, {
          canNest: () => {
            throw new Error('boom');
          },
        }),
      },
    });
    await made.store.getState().loadDocument();
    const result = made.store
      .getState()
      .dispatch({ type: 'insert', parentId: null, index: 0, element: el('el-new-sect-1', 'blixis/section') });
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid-argument' } });
  });

  it('uses the registry hooks: nesting rules and translatable properties', async () => {
    const { store } = await makeLoadedStore();
    expect(
      store
        .getState()
        .dispatch({ type: 'insert', parentId: null, index: 0, element: el('el-new-text-1', 'blixis/text') }).ok,
    ).toBe(false); // text may not be a root element
    expect(
      store
        .getState()
        .dispatch({ type: 'set-translation', locale: 'fr_FR', elementId: 'el-heading-1', set: { text: 'Bonjour' } }).ok,
    ).toBe(true);
    expect(store.getState().document?.translations['fr_FR']?.['el-heading-1']).toMatchObject({
      values: { text: 'Bonjour' },
      status: 'draft',
    });
  });
});

describe('command bridge: atomic updates and events', () => {
  const consistent = (state: EditorState): void => {
    expect(state.history?.document).toBe(state.document);
    expect(state.canUndo).toBe((state.history?.past.length ?? 0) > 0);
    expect(state.canRedo).toBe((state.history?.future.length ?? 0) > 0);
    if (state.document !== null && state.savedDocument !== null) {
      expect(state.dirty).toEqual(computeDirty(state.document, state.savedDocument));
    }
    if (state.selectedId !== null) {
      const ids = JSON.stringify(state.document?.root);
      expect(ids).toContain(`"id":"${state.selectedId}"`);
    }
  };

  it('no subscriber ever observes a torn state (store and bridge listeners)', async () => {
    const { store } = await makeLoadedStore();
    store.getState().select('el-text-1');
    let storeNotifications = 0;
    store.subscribe((state) => {
      storeNotifications += 1;
      consistent(state);
    });
    const events: DocumentEvent[] = [];
    store.getState().subscribe((event) => {
      consistent(store.getState());
      expect(store.getState().document).toBe(event.document);
      events.push(event);
    });
    const { dispatch, undo, redo } = store.getState();
    dispatch(level(3));
    dispatch({ type: 'remove', id: 'el-container-1' });
    undo();
    undo();
    redo();
    undo();
    undo(); // nothing left: no event
    expect(events.map((e) => e.type)).toEqual(['command', 'command', 'undo', 'undo', 'redo', 'undo']);
    expect(storeNotifications).toBe(6);
  });

  it('a throwing subscriber neither breaks the dispatch nor the other subscribers', async () => {
    const { store } = await makeLoadedStore();
    const seen: string[] = [];
    store.getState().subscribe(() => {
      throw new Error('faulty');
    });
    store.getState().subscribe((event) => seen.push(event.type));
    expect(store.getState().dispatch(level(3)).ok).toBe(true);
    expect(seen).toEqual(['command']);
  });

  it('unsubscribing stops notifications', async () => {
    const { store } = await makeLoadedStore();
    const seen: string[] = [];
    const off = store.getState().subscribe((event) => seen.push(event.type));
    off();
    store.getState().dispatch(level(3));
    expect(seen).toEqual([]);
  });

  it('undo and redo report whether anything changed', async () => {
    const { store } = await makeLoadedStore();
    expect(store.getState().undo()).toEqual({ ok: true, changed: false });
    expect(store.getState().redo()).toEqual({ ok: true, changed: false });
    store.getState().dispatch(level(3));
    expect(store.getState().undo()).toEqual({ ok: true, changed: true });
    expect(store.getState().canRedo).toBe(true);
    expect(store.getState().redo()).toEqual({ ok: true, changed: true });
    store.getState().undo();
    store.getState().dispatch(level(4)); // a new command clears redo
    expect(store.getState().canRedo).toBe(false);
  });

  it('limits history to 200 steps', async () => {
    const { store } = await makeLoadedStore();
    for (let i = 0; i < 230; i += 1) store.getState().dispatch(level((i % 5) + 1));
    expect(store.getState().history?.past.length).toBeLessThanOrEqual(200);
    expect(store.getState().history?.limit).toBe(200);
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

const allIds = (nodes: readonly ElementNode[]): string[] => nodes.flatMap((n) => [n.id, ...allIds(n.children)]);

describe('undo/redo parity with core on seeded random command sequences', () => {
  it.each(Array.from({ length: 25 }, (_, i) => i + 1))('seed %i', async (seed) => {
    const random = rng(seed);
    const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)] as T;
    const { store, document: initial } = await makeLoadedStore();
    const registry = createCoreRegistry();
    const ctx = {
      canNest: registry.canNest,
      sourceProperties: registry.sourceProperties,
      translationValue: registry.translationValue,
    };
    let core = createHistory(initial, 200);
    const snapshots: BuilderDocument[] = [initial];
    let counter = 0;
    let accepted = 0;
    let rejected = 0;

    for (let step = 0; step < 50; step += 1) {
      const known = allIds(store.getState().document?.root ?? []);
      const anyId = (): string => (random() < 0.1 ? 'el-missing-1' : pick(known));
      const roll = random();
      let command: unknown;
      if (roll < 0.2) {
        counter += 1;
        command = {
          type: 'insert',
          parentId: random() < 0.25 ? null : anyId(),
          index: Math.floor(random() * 3),
          element: el(
            `el-k${String(seed)}-${String(counter)}`,
            pick(['blixis/section', 'blixis/container', 'blixis/text', 'blixis/heading']),
            random() < 0.3 ? [el(`el-k${String(seed)}-${String(counter)}x`, 'blixis/text')] : [],
          ),
        };
      } else if (roll < 0.35) command = { type: 'remove', id: anyId() };
      else if (roll < 0.5)
        command = {
          type: 'move',
          id: anyId(),
          parentId: random() < 0.25 ? null : anyId(),
          index: Math.floor(random() * 3),
        };
      else if (roll < 0.65) command = { type: 'update-props', id: anyId(), set: { k: Math.floor(random() * 4) } };
      else if (roll < 0.8)
        command = {
          type: 'set-translation',
          locale: pick(['en_US', 'fr_FR', 'xx_XX']),
          elementId: anyId(),
          set: { text: pick(['a', 'b', 'c']) },
        };
      else if (roll < 0.9)
        command = { type: 'set-class-ids', id: anyId(), classIds: random() < 0.5 ? null : [pick(['cls-001'])] };
      else command = { type: 'mark-stale' };

      const before = store.getState();
      const viaStore = store.getState().dispatch(command);
      const viaCore = execute(core, command, ctx);
      expect(viaStore.ok, `step ${String(step)} agrees with core`).toBe(viaCore.ok);
      if (!viaCore.ok) {
        rejected += 1;
        expect(store.getState()).toBe(before); // a rejected command changes nothing
        continue;
      }
      accepted += 1;
      core = viaCore.history;
      expect(store.getState().document).toEqual(core.document);
      snapshots.push(core.document);
    }
    expect(accepted).toBeGreaterThan(0);
    expect(rejected).toBeGreaterThan(0);

    for (let i = snapshots.length - 2; i >= 0; i -= 1) {
      const undone = store.getState().undo();
      const coreUndone = coreUndo(core, ctx);
      expect(undone.ok && coreUndone.ok).toBe(true);
      if (coreUndone.ok) core = coreUndone.history;
      expect(store.getState().document, `undo to state ${String(i)}`).toEqual(snapshots[i]);
    }
    expect(store.getState().document).toEqual(initial);
    expect(store.getState().canUndo).toBe(false);
    for (let i = 1; i < snapshots.length; i += 1) {
      expect(store.getState().redo().ok).toBe(true);
      const redone = coreRedo(core, ctx);
      if (redone.ok) core = redone.history;
      expect(store.getState().document, `redo to state ${String(i)}`).toEqual(snapshots[i]);
    }
    expect(store.getState().canRedo).toBe(false);
  });
});

describe('coalescing', () => {
  const edit = (n: number, key = 'level'): Parameters<EditorState['dispatch']> => [level(n), { coalesceKey: key }];

  it('merges a rapid burst on the same element and properties into one undo step', async () => {
    const { store, clock, document: initial } = await makeLoadedStore();
    for (const n of [3, 4, 5, 6]) {
      store.getState().dispatch(...edit(n));
      clock.advance(200);
    }
    expect(store.getState().history?.past).toHaveLength(1);
    const after = store.getState().document;
    expect(after?.root[0]?.children[0]?.children[0]?.props).toEqual({ level: 6 });
    store.getState().undo();
    expect(store.getState().document).toEqual(initial); // exactly the pre-burst document
    expect(store.getState().canUndo).toBe(false);
    store.getState().redo();
    expect(store.getState().document).toEqual(after); // and redo reproduces the post-burst document
  });

  it('keeps the first inverse and the latest forward command', async () => {
    const { store, clock } = await makeLoadedStore();
    store.getState().dispatch(...edit(3));
    const firstInverse = store.getState().history?.past[0]?.inverse;
    clock.advance(10);
    store.getState().dispatch(...edit(5));
    const entry = store.getState().history?.past[0];
    expect(entry?.inverse).toBe(firstInverse);
    expect(entry?.command).toEqual(level(5));
  });

  it('uses a rolling 1000 ms window measured on the injected clock', async () => {
    const { store, clock } = await makeLoadedStore();
    store.getState().dispatch(...edit(3));
    clock.advance(COALESCE_WINDOW_MS); // exactly at the edge: still merged
    store.getState().dispatch(...edit(4));
    expect(store.getState().history?.past).toHaveLength(1);
    clock.advance(COALESCE_WINDOW_MS - 1); // rolling: measured from the last command of the burst
    store.getState().dispatch(...edit(5));
    expect(store.getState().history?.past).toHaveLength(1);
    clock.advance(COALESCE_WINDOW_MS + 1);
    store.getState().dispatch(...edit(6));
    expect(store.getState().history?.past).toHaveLength(2);
    store.getState().undo();
    expect(store.getState().document?.root[0]?.children[0]?.children[0]?.props).toEqual({ level: 5 });
  });

  it.each([
    ['another element', () => ({ type: 'update-props', id: 'el-text-1', set: { level: 4 } })],
    ['another property set', () => ({ type: 'update-props', id: 'el-heading-1', set: { level: 4, other: 1 } })],
    ['unset instead of set', () => ({ type: 'update-props', id: 'el-heading-1', unset: ['level'] })],
    ['another kind of command', () => ({ type: 'set-class-ids', id: 'el-heading-1', classIds: null })],
  ])('does not merge %s', async (_, next) => {
    const { store, clock } = await makeLoadedStore();
    store.getState().dispatch(...edit(3));
    clock.advance(10);
    store.getState().dispatch(next(), { coalesceKey: 'level' });
    expect(store.getState().history?.past).toHaveLength(2);
  });

  it('does not merge across keys, without a key, after an undo/redo, after a load or after another command', async () => {
    const { store, clock } = await makeLoadedStore();
    store.getState().dispatch(...edit(3, 'a'));
    store.getState().dispatch(...edit(4, 'b'));
    expect(store.getState().history?.past).toHaveLength(2);
    store.getState().dispatch(level(5)); // no key
    store.getState().dispatch(level(6), { coalesceKey: 'b' });
    expect(store.getState().history?.past).toHaveLength(4);
    store.getState().undo();
    store.getState().dispatch(...edit(7, 'b'));
    store.getState().dispatch(...edit(8, 'b'));
    expect(store.getState().history?.past).toHaveLength(4); // 3 kept + 1 merged burst
    clock.advance(5);
    store.getState().dispatch({ type: 'set-class-ids', id: 'el-heading-1', classIds: null });
    store.getState().dispatch(...edit(9, 'b'));
    expect(store.getState().history?.past).toHaveLength(6);
    expect(store.getState().coalesce).not.toBeNull();
    await store.getState().loadDocument();
    expect(store.getState().coalesce).toBeNull();
  });

  it('coalesces set-translation bursts including the stale marking of other locales', async () => {
    const { store, clock } = await makeLoadedStore();
    // A finished French translation of the heading, made from the current English text.
    store.getState().dispatch({
      type: 'set-translation',
      locale: 'fr_FR',
      elementId: 'el-heading-1',
      set: { text: 'Bonjour' },
      status: 'translated',
    });
    clock.advance(5000);
    const pre = store.getState().document;
    const type = (text: string) =>
      store
        .getState()
        .dispatch(
          { type: 'set-translation', locale: 'en_US', elementId: 'el-heading-1', set: { text } },
          { coalesceKey: 'text' },
        );
    for (const text of ['H', 'He', 'Hel', 'Hell', 'Hello!']) {
      expect(type(text).ok).toBe(true);
      clock.advance(100);
    }
    expect(store.getState().history?.past).toHaveLength(2);
    const post = store.getState().document;
    expect(post?.translations['fr_FR']?.['el-heading-1']?.status).toBe('stale');
    store.getState().undo();
    expect(store.getState().document).toEqual(pre);
    expect(store.getState().document?.translations['fr_FR']?.['el-heading-1']?.status).toBe('translated');
    store.getState().redo();
    expect(store.getState().document).toEqual(post);
  });

  it('ignores a coalesce key on commands that cannot merge', async () => {
    const { store } = await makeLoadedStore();
    store.getState().dispatch({ type: 'remove', id: 'el-text-1' }, { coalesceKey: 'x' });
    store.getState().dispatch({ type: 'remove', id: 'el-button-1' }, { coalesceKey: 'x' });
    expect(store.getState().history?.past).toHaveLength(2);
    expect(store.getState().coalesce).toBeNull();
  });

  it('keeps the history limit when merging at the limit', async () => {
    const { store, clock } = await makeLoadedStore({ deps: { historyLimit: 3 } });
    for (let i = 0; i < 5; i += 1) {
      store.getState().dispatch({ type: 'update-props', id: 'el-text-1', set: { n: i } });
    }
    expect(store.getState().history?.past).toHaveLength(3);
    store.getState().dispatch(...edit(3));
    clock.advance(10);
    store.getState().dispatch(...edit(4));
    expect(store.getState().history?.past).toHaveLength(3);
  });
});

describe('coalescing on seeded random bursts', () => {
  it.each(Array.from({ length: 20 }, (_, i) => i + 1))('seed %i', async (seed) => {
    const random = rng(seed * 7919);
    const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)] as T;
    const { store, clock, document: initial } = await makeLoadedStore();
    const before: BuilderDocument[] = []; // document before each undo step
    const after: BuilderDocument[] = []; // document after each undo step (the end of its burst)
    let shape = { kind: 'props', id: 'el-heading-1', locale: 'en_US', wide: false, key: 'k1' };
    for (let step = 0; step < 60; step += 1) {
      const previous = documentOf(store);
      const stepsBefore = store.getState().history?.past.length ?? 0;
      if (random() < 0.25) {
        shape = {
          kind: pick(['props', 'translation']),
          id: pick(['el-heading-1', 'el-text-1']),
          locale: pick(['en_US', 'fr_FR']),
          wide: random() < 0.5,
          key: pick(['k1', 'k2']),
        };
      }
      const command: Command =
        shape.kind === 'props'
          ? { type: 'update-props', id: shape.id, set: shape.wide ? { a: step, b: 1 } : { a: step } }
          : { type: 'set-translation', locale: shape.locale, elementId: shape.id, set: { text: `t${String(step)}` } };
      const result = store.getState().dispatch(command, random() < 0.9 ? { coalesceKey: shape.key } : {});
      expect(result.ok).toBe(true);
      const stepsAfter = store.getState().history?.past.length ?? 0;
      const current = documentOf(store);
      if (stepsAfter > stepsBefore) {
        before.push(previous);
        after.push(current);
      } else {
        after[after.length - 1] = current; // merged into the previous step
      }
      clock.advance(pick([0, 100, 600, 1500]));
    }
    expect(before.length).toBeLessThan(60); // some bursts really merged
    for (let i = before.length - 1; i >= 0; i -= 1) {
      store.getState().undo();
      expect(store.getState().document, `undo step ${String(i)}`).toEqual(before[i]);
    }
    expect(store.getState().document).toEqual(initial);
    for (let i = 0; i < after.length; i += 1) {
      store.getState().redo();
      expect(store.getState().document, `redo step ${String(i)}`).toEqual(after[i]);
    }
  });
});

describe('performance sanity', () => {
  it('handles 1,000 commands and a 300-step coalesced burst on a 5,000-element document, with dirty comparison, in time', async () => {
    // 1 section + 50 containers + 4,949 texts = 5,000 elements, the document limit.
    const children = (c: number) =>
      Array.from({ length: c === 0 ? 98 : 99 }, (_, t) => el(`el-t-${String(c)}-${String(t)}`, 'blixis/text'));
    const root = [
      el(
        'el-big-section',
        'blixis/section',
        Array.from({ length: 50 }, (_, c) => el(`el-big-c-${String(c)}`, 'blixis/container', children(c))),
      ),
    ];
    const doc = makeDocument({ root, translations: { en_US: {}, fr_FR: {} } });
    expect(allIds(doc.root)).toHaveLength(5000);
    const { store, clock } = await makeLoadedStore({ document: doc });
    store.getState().select('el-t-39-48');
    const started = performance.now();
    for (let i = 0; i < 1000; i += 1) {
      const result = store
        .getState()
        .dispatch({ type: 'update-props', id: `el-t-${String(i % 40)}-${String(i % 49)}`, set: { n: i } });
      if (!result.ok) throw new Error(result.error.message);
    }
    for (let i = 0; i < 300; i += 1) {
      const result = store
        .getState()
        .dispatch({ type: 'update-props', id: 'el-t-1-1', set: { typed: i } }, { coalesceKey: 'typed' });
      if (!result.ok) throw new Error(result.error.message);
      clock.advance(10);
    }
    const elapsed = performance.now() - started;
    expect(store.getState().history?.past).toHaveLength(200);
    expect(store.getState().dirty.layout).toBe(true);
    expect(store.getState().history?.past.at(-1)?.command).toMatchObject({ set: { typed: 299 } }); // one merged burst
    // Generous bound (CI machines vary) that still catches accidental O(n) clones or whole-tree walks per keystroke.
    expect(elapsed).toBeLessThan(10_000);
  });
});

describe('coalescing only when the merged result is exactly reproducible', () => {
  const typeText = (store: Awaited<ReturnType<typeof makeLoadedStore>>['store'], text: string) =>
    store
      .getState()
      .dispatch(
        { type: 'set-translation', locale: 'en_US', elementId: 'el-heading-1', set: { text } },
        { coalesceKey: 'text' },
      );
  const finishFrench = (store: Awaited<ReturnType<typeof makeLoadedStore>>['store']) =>
    store.getState().dispatch({
      type: 'set-translation',
      locale: 'fr_FR',
      elementId: 'el-heading-1',
      set: { text: 'Bonjour' },
      status: 'translated',
    });

  it('typing "Hello!" and backspacing to "Hello" keeps the stale marking on redo', async () => {
    const { store, clock } = await makeLoadedStore();
    finishFrench(store);
    clock.advance(5000);
    typeText(store, 'Hello!');
    clock.advance(50);
    typeText(store, 'Hello');
    const final = store.getState().document;
    expect(final?.translations['fr_FR']?.['el-heading-1']?.status).toBe('stale');
    const steps = store.getState().history?.past.length ?? 0;
    expect(steps).toBe(3); // the revert could not be merged: an exact replay would lose the stale marking
    store.getState().undo();
    store.getState().undo();
    expect(store.getState().document?.translations['fr_FR']?.['el-heading-1']?.status).toBe('translated');
    store.getState().redo();
    store.getState().redo();
    expect(store.getState().document).toEqual(final);
    expect(store.getState().document?.translations['fr_FR']?.['el-heading-1']?.status).toBe('stale');
  });

  it('still merges a burst whose final replay from the pre-burst document is exact', async () => {
    const { store, clock } = await makeLoadedStore();
    finishFrench(store);
    clock.advance(5000);
    for (const text of ['Hi', 'Hi!', 'Hi!!']) {
      typeText(store, text);
      clock.advance(50);
    }
    expect(store.getState().history?.past).toHaveLength(2);
    const final = store.getState().document;
    store.getState().undo();
    store.getState().redo();
    expect(store.getState().document).toEqual(final);
  });

  it('a status change of another locale in the middle of a burst does not corrupt undo or redo', async () => {
    const { store, clock } = await makeLoadedStore();
    finishFrench(store);
    clock.advance(5000);
    const pre = store.getState().document;
    typeText(store, 'Hello!'); // marks fr_FR stale
    clock.advance(50);
    finishFrench(store); // not part of the burst: the burst ends
    clock.advance(50);
    typeText(store, 'Hello'); // new burst
    const final = store.getState().document;
    expect(store.getState().history?.past).toHaveLength(4);
    for (let i = 0; i < 3; i += 1) store.getState().undo();
    expect(store.getState().document).toEqual(pre);
    for (let i = 0; i < 3; i += 1) store.getState().redo();
    expect(store.getState().document).toEqual(final);
  });
});

describe('listener delivery order and re-entrancy', () => {
  it('a listener that dispatches does not reorder events for later listeners', async () => {
    const { store } = await makeLoadedStore();
    const first: number[] = [];
    const second: number[] = [];
    const levelOf = (event: DocumentEvent) => Number(event.document.root[0]?.children[0]?.children[0]?.props['level']);
    let nested = false;
    store.getState().subscribe((event) => {
      first.push(levelOf(event));
      if (!nested) {
        nested = true;
        store.getState().dispatch(level(2 + 4)); // 6, inside the delivery of 3
      }
    });
    store.getState().subscribe((event) => {
      second.push(levelOf(event));
      expect(event.document).toBeDefined();
    });
    store.getState().dispatch(level(3));
    expect(first).toEqual([3, 6]);
    expect(second).toEqual([3, 6]);
    expect(levelOf({ type: 'command', document: documentOf(store) })).toBe(6);
  });

  it('a listener that undoes sees ordered events and a consistent store', async () => {
    const { store } = await makeLoadedStore();
    const types: string[][] = [[], []];
    let done = false;
    store.getState().subscribe((event) => {
      types[0]?.push(event.type);
      if (event.type === 'command' && !done) {
        done = true;
        store.getState().undo();
      }
    });
    store.getState().subscribe((event) => {
      types[1]?.push(event.type);
    });
    store.getState().dispatch(level(3));
    expect(types).toEqual([
      ['command', 'undo'],
      ['command', 'undo'],
    ]);
    expect(store.getState().canUndo).toBe(false);
  });

  it('a listener unsubscribed during delivery is not called afterwards, and others are isolated from throws', async () => {
    const { store } = await makeLoadedStore();
    const seen: string[] = [];
    let offSecond = (): void => undefined;
    store.getState().subscribe(() => {
      seen.push('a');
      offSecond();
      throw new Error('faulty');
    });
    offSecond = store.getState().subscribe(() => seen.push('b'));
    store.getState().subscribe(() => seen.push('c'));
    store.getState().dispatch(level(3));
    store.getState().dispatch(level(4));
    expect(seen).toEqual(['a', 'c', 'a', 'c']);
  });

  it('events carry the document of their own moment', async () => {
    const { store } = await makeLoadedStore();
    const documents: BuilderDocument[] = [];
    let nested = false;
    store.getState().subscribe((event) => {
      documents.push(event.document);
      if (!nested) {
        nested = true;
        store.getState().dispatch(level(5));
      }
    });
    store.getState().dispatch(level(3));
    expect(documents).toHaveLength(2);
    expect(documents[0]?.root[0]?.children[0]?.children[0]?.props).toEqual({ level: 3 });
    expect(documents[1]).toBe(store.getState().document);
  });
});

describe('editing after a failed reload', () => {
  it('refuses dispatch, undo and redo while the status is error, and works again after a successful reload', async () => {
    let fail = false;
    const doc = makeDocument();
    const streams = streamsOf(doc);
    const client = fakeClient({
      layout: () => Promise.resolve(fail ? { ok: false, error: { kind: 'http', status: 500 } } : ok(streams.layout)),
      contents: streams.contents,
    });
    const store = createEditorStore({ client, bootstrap: makeBootstrap(), storage: memoryStorage() });
    await store.getState().loadDocument();
    store.getState().dispatch(level(3));
    store.getState().undo();
    fail = true;
    await store.getState().loadDocument();
    expect(store.getState().status).toBe('error');
    const before = store.getState();
    for (const result of [store.getState().dispatch(level(4)), store.getState().undo(), store.getState().redo()]) {
      expect(result).toMatchObject({ ok: false, error: { code: 'not-ready' } });
    }
    expect(store.getState().document).toBe(before.document);
    fail = false;
    await store.getState().loadDocument();
    expect(store.getState().dispatch(level(4)).ok).toBe(true);
  });
});
