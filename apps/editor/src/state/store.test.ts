import { describe, expect, it, vi } from 'vitest';
import { CHROME_STORAGE_KEY } from '../chrome-theme';
import { PANELS_STORAGE_KEY } from '../panels';
import { makeBootstrap } from '../test/fixtures';
import {
  documentOf,
  fakeClient,
  makeDocument,
  makeLoadedStore,
  makeStore,
  manualClock,
  memoryStorage,
  ok,
  streamsOf,
} from '../test/state-helpers';
import { createEditorStore, isDirty, viewStorageKey, type DocumentEvent } from './index';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

describe('document slice: loading', () => {
  it('loads page settings lazily and includes a partial page write after layout and content', async () => {
    const { store, client } = await makeLoadedStore();
    const writes: string[] = [];
    client.writeLayout = (_document, revision) => {
      writes.push('layout');
      return Promise.resolve(ok({ revision: revision + 1 }));
    };
    client.writeContent = (_locale, _document, revision) => {
      writes.push('content');
      return Promise.resolve(ok({ revision: revision + 1 }));
    };
    client.writePage = (body) => {
      writes.push(`page:${JSON.stringify(body)}`);
      return Promise.resolve(ok({ version: '2222222222222222222222222222222222222222' }));
    };
    expect(store.getState().pageSettings).toBeNull();
    await store.getState().loadPageSettings();
    expect(store.getState().pageSettingsStatus).toBe('ready');
    store.getState().updatePageSettings({ title: 'Updated title' });
    store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: 3 } });
    store.getState().dispatch({
      type: 'set-translation',
      locale: 'en_US',
      elementId: 'el-heading-1',
      set: { text: 'Updated content' },
    });
    expect(isDirty(store.getState())).toBe(true);
    await store.getState().saveDraft();
    expect(writes.map((item) => item.split(':')[0])).toEqual(['layout', 'content', 'page']);
    expect(writes[2]).toBe('page:{"title":"Updated title"}');
    expect(store.getState().pageSettingsDirty).toBe(false);
  });

  it('keeps local page edits on a 409 and reloads the server values only after the conflict choice', async () => {
    const { store, client } = await makeLoadedStore();
    await store.getState().loadPageSettings();
    store.getState().updatePageSettings({ title: 'Local title' });
    client.writePage = () =>
      Promise.resolve({ ok: false, error: { kind: 'http', status: 409, code: 'blixis_conflict' } });
    await store.getState().saveDraft();
    expect(store.getState()).toMatchObject({
      saveStatus: 'failed',
      saveErrorKey: 'save.error.conflict',
      pageSettings: { title: 'Local title' },
      pageSettingsDirty: true,
    });
    await store.getState().resolveConflict('reload');
    expect(store.getState()).toMatchObject({
      pageSettings: { title: 'About us' },
      pageSettingsDirty: false,
      saveStatus: 'idle',
    });
  });
  it('defaults to two expanded levels and remembers an intentionally collapsed-all tree across reloads', async () => {
    const { store } = await makeLoadedStore();
    expect(new Set(store.getState().expandedIds)).toEqual(new Set(['el-section-1', 'el-section-2', 'el-container-1']));
    for (const id of [...store.getState().expandedIds]) store.getState().setExpanded(id, false);
    expect(store.getState().expandedIds).toEqual([]);
    await store.getState().loadDocument();
    expect(store.getState().expandedIds).toEqual([]);
    expect(store.getState().expandedInitialized).toBe(true);
  });

  it('restores an intentionally collapsed-all expansion set in a fresh editor store', async () => {
    const storage = memoryStorage();
    const bootstrap = makeBootstrap();
    const streams = streamsOf(makeDocument());
    const first = createEditorStore({ client: fakeClient(streams), bootstrap, storage });
    await first.getState().loadDocument();
    for (const id of [...first.getState().expandedIds]) first.getState().setExpanded(id, false);
    const reloaded = createEditorStore({ client: fakeClient(streams), bootstrap, storage });
    expect(reloaded.getState().expandedInitialized).toBe(true);
    await reloaded.getState().loadDocument();
    expect(reloaded.getState().expandedIds).toEqual([]);
  });

  it('keeps expanded structure ids and prunes ids when nodes disappear', async () => {
    const { store } = await makeLoadedStore();
    const parent = store.getState().document?.root[0];
    expect(parent).toBeTruthy();
    if (!parent) return;
    store.getState().setExpanded(parent.id, false);
    expect(store.getState().expandedIds).not.toContain(parent.id);
    store.getState().setExpanded(parent.id, true);
    expect(store.getState().expandedIds).toContain(parent.id);
    store.getState().dispatch({ type: 'remove', id: parent.id });
    expect(store.getState().expandedIds).not.toContain(parent.id);
  });

  it('preserves the expanded-id array reference for edits that do not prune expansion', async () => {
    const { store } = await makeLoadedStore();
    const expanded = store.getState().expandedIds;
    store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: 3 } });
    expect(store.getState().expandedIds).toBe(expanded);
  });

  it('expands selected ancestors together in one state update', async () => {
    const { store } = await makeLoadedStore();
    const notifications: number[] = [];
    const unsubscribe = store.subscribe(() => {
      notifications.push(1);
    });
    store.getState().setExpanded('el-container-1', false);
    notifications.length = 0;
    store.getState().expandMany(['el-section-1', 'el-container-1']);
    expect(store.getState().expandedIds).toEqual(expect.arrayContaining(['el-section-1', 'el-container-1']));
    expect(notifications).toHaveLength(1);
    unsubscribe();
  });

  it('starts idle and loads layout plus every enabled locale in parallel', async () => {
    const { store, client, document } = makeStore();
    expect(store.getState()).toMatchObject({ status: 'idle', document: null, error: null, canUndo: false });
    const loading = store.getState().loadDocument();
    expect(store.getState().status).toBe('loading');
    expect(client.layoutCalls).toBe(1);
    expect(client.contentCalls).toEqual(['en_US', 'fr_FR']); // all requested before any resolved
    await loading;
    const state = store.getState();
    expect(state.status).toBe('ready');
    expect(state.document).toEqual(document);
    expect(state.savedDocument).toBe(state.document);
    expect(state.revisions).toEqual({ layout: 5, content: { en_US: 2, fr_FR: 2 } });
    expect(state.dirty).toEqual({ layout: false, content: { en_US: false, fr_FR: false } });
    expect(isDirty(state)).toBe(false);
    expect(state.history?.document).toBe(state.document);
  });

  it('builds a skeleton when nothing was ever written (revision 0)', async () => {
    const client = fakeClient({ layout: { revision: 0, locale: null, document: null }, contents: {} });
    const clock = manualClock(Date.UTC(2026, 0, 2, 3, 4, 5));
    const store = createEditorStore({ client, bootstrap: makeBootstrap(), now: clock.now, storage: memoryStorage() });
    await store.getState().loadDocument();
    expect(store.getState().document).toMatchObject({
      documentId: 'post-42',
      layoutRevision: 0,
      root: [],
      metadata: { updatedAt: '2026-01-02T03:04:05Z', editorVersion: '0.1.0' },
    });
    expect(store.getState().revisions).toEqual({ layout: 0, content: { en_US: 0, fr_FR: 0 } });
  });

  it('keeps the previous state and sets the error when a reload fails', async () => {
    let fail = false;
    const doc = makeDocument();
    const streams = streamsOf(doc);
    const client = fakeClient({
      layout: () => Promise.resolve(fail ? { ok: false, error: { kind: 'http', status: 403 } } : ok(streams.layout)),
      contents: streams.contents,
    });
    const store = createEditorStore({ client, bootstrap: makeBootstrap(), storage: memoryStorage() });
    await store.getState().loadDocument();
    const before = store.getState();
    fail = true;
    await store.getState().loadDocument();
    const after = store.getState();
    expect(after.status).toBe('error');
    expect(after.error).toEqual({ type: 'api', error: { kind: 'http', status: 403 } });
    expect(after.document).toBe(before.document);
    expect(after.history).toBe(before.history);
    expect(after.revisions).toBe(before.revisions);
    fail = false;
    await store.getState().loadDocument();
    expect(store.getState()).toMatchObject({ status: 'ready', error: null });
  });

  it('never loads a partial document: invalid content is a typed error', async () => {
    const streams = streamsOf(makeDocument());
    const bad = { ...streams.contents['fr_FR'], document: { schemaVersion: 1, locale: 'nl_NL', entries: {} } };
    const client = fakeClient({ layout: streams.layout, contents: { ...streams.contents, fr_FR: bad as never } });
    const store = createEditorStore({ client, bootstrap: makeBootstrap(), storage: memoryStorage() });
    await store.getState().loadDocument();
    expect(store.getState()).toMatchObject({
      status: 'error',
      document: null,
      error: { type: 'invalid', error: { code: 'locale-mismatch', locale: 'fr_FR' } },
    });
  });

  it('refuses a read whose locale differs from the requested one', async () => {
    const streams = streamsOf(makeDocument());
    const client = fakeClient({
      layout: streams.layout,
      contents: { ...streams.contents, fr_FR: { ...streams.contents['fr_FR'], locale: 'en_US' } as never },
    });
    const store = createEditorStore({ client, bootstrap: makeBootstrap(), storage: memoryStorage() });
    await store.getState().loadDocument();
    expect(store.getState()).toMatchObject({ status: 'error', document: null, error: { type: 'invalid' } });
  });

  it('a newer load aborts the older one and the late result of the first is ignored', async () => {
    const first = deferred<ReturnType<typeof ok<(typeof streams)['layout']>>>();
    const docA = makeDocument({ layoutRevision: 1 });
    const docB = makeDocument({ layoutRevision: 2 });
    const streams = streamsOf(docA);
    const streamsB = streamsOf(docB);
    let calls = 0;
    const signals: (AbortSignal | undefined)[] = [];
    const base = fakeClient({ layout: streams.layout, contents: streams.contents });
    const client = {
      ...base,
      readLayout: (options?: { signal?: AbortSignal }) => {
        signals.push(options?.signal);
        calls += 1;
        return calls === 1 ? first.promise : Promise.resolve(ok(streamsB.layout));
      },
    };
    const store = createEditorStore({ client, bootstrap: makeBootstrap(), storage: memoryStorage() });
    const events: DocumentEvent['type'][] = [];
    store.getState().subscribe((event) => events.push(event.type));
    const one = store.getState().loadDocument();
    const two = store.getState().loadDocument();
    await two;
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
    expect(store.getState().document?.layoutRevision).toBe(2);
    first.resolve(ok(streams.layout)); // the first request answers late
    await one;
    expect(store.getState()).toMatchObject({ status: 'ready' });
    expect(store.getState().document?.layoutRevision).toBe(2);
    expect(store.getState().revisions.layout).toBe(5);
    expect(events).toEqual(['load']);
  });

  it('an aborted caller signal restores the previous status without an error', async () => {
    const controller = new AbortController();
    const { store } = makeStore();
    controller.abort();
    await store.getState().loadDocument({ signal: controller.signal });
    expect(store.getState()).toMatchObject({ status: 'idle', error: null, document: null });
  });

  it('notifies load subscribers with the new document', async () => {
    const { store } = makeStore();
    const seen: DocumentEvent[] = [];
    const off = store.getState().subscribe((event) => seen.push(event));
    await store.getState().loadDocument();
    off();
    await store.getState().loadDocument();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ type: 'load', document: store.getState().document });
  });

  it('stores are isolated: no module-level state', async () => {
    const a = await makeLoadedStore();
    const b = makeStore();
    expect(b.store.getState().document).toBeNull();
    a.store.getState().select('el-text-1');
    expect(b.store.getState().selectedId).toBeNull();
  });
});

describe('publication slice', () => {
  it('saves a dirty draft before publishing and refreshes the publication state', async () => {
    const { store, client } = makeStore();
    const order: string[] = [];
    let phase: 'initial' | 'saved' | 'published' = 'initial';
    client.readPublication = () =>
      Promise.resolve(
        ok(
          phase === 'initial'
            ? {
                pointerRevision: 7,
                layout: { state: 'published', snapshot: 1, workingRevision: 1 },
                locales: { en_US: { state: 'published', snapshot: 1, workingRevision: 1 } },
              }
            : phase === 'saved'
              ? {
                  pointerRevision: 7,
                  layout: { state: 'published-with-pending-changes', snapshot: 1, workingRevision: 2 },
                  locales: { en_US: { state: 'published', snapshot: 1, workingRevision: 1 } },
                }
              : {
                  pointerRevision: 8,
                  layout: { state: 'published', snapshot: 2, workingRevision: 2 },
                  locales: { en_US: { state: 'published', snapshot: 2, workingRevision: 2 } },
                },
        ),
      );
    client.writeLayout = (_doc, revision) => {
      order.push(`save:${String(revision)}`);
      phase = 'saved';
      return Promise.resolve(ok({ revision: revision + 1 }));
    };
    client.publish = (options) => {
      order.push(`publish:${String(options.pointerRevision)}:${String(options.layout)}`);
      phase = 'published';
      return Promise.resolve(ok({ pointerRevision: 8, layoutSnapshot: 2, contentSnapshot: null, pinnedLocales: [] }));
    };
    await store.getState().loadDocument();
    store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: 3 } });
    await store.getState().publish(['en_US']);
    expect(order).toEqual(['save:5', 'publish:7:true']);
    expect(store.getState().publication).toMatchObject({ pointerRevision: 8, layout: { state: 'published' } });
    expect(store.getState().publicationStatus).toBe('idle');
    expect(store.getState().publicationSuccess).toBe(true);
  });

  it('aborts publication when saving the dirty draft fails', async () => {
    const { store, client } = await makeLoadedStore();
    client.writeLayout = () => Promise.resolve({ ok: false, error: { kind: 'http', status: 500 } });
    const publishMock = vi.fn(() =>
      Promise.resolve(ok({ pointerRevision: 1, layoutSnapshot: 1, contentSnapshot: null, pinnedLocales: [] })),
    );
    client.publish = publishMock;
    store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: 3 } });
    await store.getState().publish(['en_US']);
    expect(publishMock).not.toHaveBeenCalled();
    expect(store.getState().publicationStatus).toBe('failed');
  });
});

describe('document slice: draft saving', () => {
  it('writes only a dirty layout with its known revision and records the returned revision', async () => {
    const { store, client } = await makeLoadedStore();
    const write = vi.fn().mockResolvedValue(ok({ revision: 9 }));
    client.writeLayout = write;
    store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: 3 } });
    await store.getState().saveDraft();
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]?.[1]).toBe(5);
    expect(store.getState().revisions.layout).toBe(9);
    expect(store.getState().dirty.layout).toBe(false);
  });

  it('coalesces concurrent save requests and leaves edits made in flight dirty', async () => {
    const { store, client } = await makeLoadedStore();
    let finish!: (value: ReturnType<typeof ok<{ revision: number }>>) => void;
    const write = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    client.writeLayout = write as never;
    store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: 3 } });
    const one = store.getState().saveDraft();
    const two = store.getState().saveDraft();
    expect(two).toBe(one);
    store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: 4 } });
    finish(ok({ revision: 6 }));
    await one;
    expect(store.getState().dirty.layout).toBe(true);
  });

  it('writes dirty streams in layout then lexical locale order with their If-Match revisions', async () => {
    const { store, client } = await makeLoadedStore();
    const calls: string[] = [];
    client.writeLayout = vi.fn((_doc: unknown, revision: number) => {
      calls.push(`layout:${String(revision)}`);
      return Promise.resolve(ok({ revision: 6 }));
    });
    client.writeContent = vi.fn((locale: string, _doc: unknown, revision: number) => {
      calls.push(`${locale}:${String(revision)}`);
      return Promise.resolve(ok({ revision: 3 }));
    });
    store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: 3 } });
    store
      .getState()
      .dispatch({ type: 'set-translation', locale: 'fr_FR', elementId: 'el-heading-1', set: { text: 'Salut' } });
    store
      .getState()
      .dispatch({ type: 'set-translation', locale: 'en_US', elementId: 'el-heading-1', set: { text: 'Hi' } });
    await store.getState().saveDraft();
    expect(calls).toEqual(['layout:5', 'en_US:2', 'fr_FR:2']);
    expect(store.getState().dirty).toEqual({ layout: false, content: { en_US: false, fr_FR: false } });
  });

  it('preserves only the failed and unsent content streams after a partial save', async () => {
    const { store, client } = await makeLoadedStore();
    client.writeLayout = vi.fn(() => Promise.resolve(ok({ revision: 6 })));
    client.writeContent = vi.fn((locale: string) =>
      Promise.resolve(
        (locale === 'en_US' ? ok({ revision: 3 }) : { ok: false, error: { kind: 'http', status: 500 } }) as never,
      ),
    );
    store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: 3 } });
    store
      .getState()
      .dispatch({ type: 'set-translation', locale: 'en_US', elementId: 'el-heading-1', set: { text: 'Hi' } });
    store
      .getState()
      .dispatch({ type: 'set-translation', locale: 'fr_FR', elementId: 'el-heading-1', set: { text: 'Salut' } });
    await store.getState().saveDraft();
    expect(store.getState().dirty).toEqual({ layout: false, content: { en_US: false, fr_FR: true } });
    expect(store.getState().revisions).toEqual({ layout: 6, content: { en_US: 3, fr_FR: 2 } });
  });

  it('aborts the active request when the caller signal aborts', async () => {
    const { store, client } = await makeLoadedStore();
    const controller = new AbortController();
    let signal: AbortSignal | undefined;
    client.writeLayout = vi.fn((_doc: unknown, _revision: number, options?: { signal?: AbortSignal }) => {
      signal = options?.signal;
      return new Promise((resolve) => {
        options?.signal?.addEventListener(
          'abort',
          () => {
            resolve({ ok: false, error: { kind: 'aborted' } });
          },
          { once: true },
        );
      });
    }) as never;
    store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: 3 } });
    const pending = store.getState().saveDraft({ signal: controller.signal });
    controller.abort();
    expect(signal?.aborted).toBe(true);
    store.getState().cancelSave();
    await pending;
    expect(store.getState().saveStatus).toBe('idle');
  });

  it.each([
    [{ kind: 'http', status: 409, code: 'blixis_conflict' }, 'save.error.conflict'],
    [{ kind: 'http', status: 401 }, 'save.error.auth'],
    [{ kind: 'http', status: 403 }, 'save.error.auth'],
    [{ kind: 'http', status: 423, code: 'blixis_theme_locked' }, 'save.error.locked'],
    [{ kind: 'http', status: 413 }, 'save.error.large'],
    [{ kind: 'http', status: 422 }, 'save.error.validation'],
    [{ kind: 'http', status: 429 }, 'save.error.rate'],
    [{ kind: 'network' }, 'save.error.offline'],
    [{ kind: 'http', status: 503, data: { message: 'private raw server detail' } }, 'save.error.server'],
  ] as const)('maps API error %j to stable translated state', async (error, key) => {
    const { store, client } = await makeLoadedStore();
    client.writeLayout = vi.fn(() => Promise.resolve({ ok: false, error }) as never);
    store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: 3 } });
    await store.getState().saveDraft();
    expect(store.getState()).toMatchObject({ saveStatus: 'failed', saveError: error, saveErrorKey: key });
    expect(store.getState().dirty.layout).toBe(true);
  });

  const recoveryErrorCases = [
    [{ kind: 'http', status: 409, code: 'blixis_conflict' }, 'save.error.conflict'],
    [{ kind: 'http', status: 401 }, 'save.error.auth'],
    [{ kind: 'http', status: 403 }, 'save.error.auth'],
    [{ kind: 'http', status: 423, code: 'blixis_theme_locked' }, 'save.error.locked'],
    [{ kind: 'http', status: 413 }, 'save.error.large'],
    [{ kind: 'http', status: 422 }, 'save.error.validation'],
    [{ kind: 'http', status: 429 }, 'save.error.rate'],
    [{ kind: 'network' }, 'save.error.offline'],
    [{ kind: 'http', status: 503 }, 'save.error.server'],
  ] as const;
  const dirtyScenarios = ['layout', 'english', 'french', 'layout-english', 'both-locales', 'all-streams'] as const;
  const recoveryMatrix = recoveryErrorCases.flatMap(([error, key]) =>
    dirtyScenarios.map((scenario) => ({ error, key, scenario })),
  );
  it.each(recoveryMatrix)(
    'keeps $scenario edits dirty when $error.kind/$error.status fails',
    async ({ error, key, scenario }) => {
      const { store, client } = await makeLoadedStore();
      const edit = (locale: 'en_US' | 'fr_FR') =>
        store.getState().dispatch({
          type: 'set-translation',
          locale,
          elementId: 'el-heading-1',
          set: { text: `changed-${locale}` },
        });
      if (scenario.includes('layout') || scenario === 'all-streams') {
        store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: 3 } });
      }
      if (scenario.includes('english') || scenario === 'both-locales' || scenario === 'all-streams') edit('en_US');
      if (scenario.includes('french') || scenario === 'both-locales' || scenario === 'all-streams') edit('fr_FR');
      client.writeLayout = vi.fn(() => Promise.resolve(ok({ revision: 6 })));
      client.writeContent = vi.fn(() => Promise.resolve({ ok: false, error }) as never);
      if (scenario.includes('layout') || scenario === 'all-streams') {
        client.writeLayout = vi.fn(() => Promise.resolve({ ok: false, error }) as never);
      }
      await store.getState().saveDraft();
      const dirty = store.getState().dirty;
      expect(store.getState()).toMatchObject({ saveStatus: 'failed', saveErrorKey: key });
      if (scenario.includes('layout') || scenario === 'all-streams') expect(dirty.layout).toBe(true);
      else expect(dirty.layout).toBe(false);
      if (scenario.includes('english') || scenario === 'both-locales' || scenario === 'all-streams')
        expect(dirty.content['en_US']).toBe(true);
      if (scenario.includes('french') || scenario === 'both-locales' || scenario === 'all-streams')
        expect(dirty.content['fr_FR']).toBe(true);
    },
  );

  it('uses the fallback five second rate retry delay', async () => {
    const { store, client } = await makeLoadedStore();
    client.writeLayout = vi.fn(() => Promise.resolve({ ok: false, error: { kind: 'http', status: 429 } }) as never);
    store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: 3 } });
    await store.getState().saveDraft();
    expect(store.getState().retryAfterMs).toBe(5000);
  });

  it('makes editing read-only after a theme-guard 423 while preserving the dirty draft', async () => {
    const { store, client } = await makeLoadedStore();
    client.writeLayout = vi.fn(
      () =>
        Promise.resolve({
          ok: false,
          error: { kind: 'http', status: 423, code: 'blixis_theme_incompatible' },
        }) as never,
    );
    store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: 3 } });
    await store.getState().saveDraft();
    expect(store.getState().saveLocked).toBe(true);
    expect(store.getState().dirty.layout).toBe(true);
    expect(store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: 4 } })).toMatchObject({
      ok: false,
      error: { code: 'read-only' },
    });
  });

  it.each([
    [1, 1000],
    [30, 30000],
    [31, 30000],
    [120, 30000],
    [-2, 0],
  ])('bounds Retry-After %s seconds to %s milliseconds', async (seconds, expected) => {
    const { store, client } = await makeLoadedStore();
    client.writeLayout = vi.fn(() =>
      Promise.resolve({
        ok: false,
        error: { kind: 'http', status: 429, data: { retryAfter: seconds } },
      } as never),
    );
    store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: 3 } });
    await store.getState().saveDraft();
    expect(store.getState().retryAfterMs).toBe(expected);
  });

  it('re-reads all dirty revisions before overwrite writes, and retries only once', async () => {
    const { store, client } = await makeLoadedStore();
    const order: string[] = [];
    client.readLayout = vi.fn(() => {
      order.push('read-layout');
      return Promise.resolve(ok({ revision: 8, locale: null, document: null }));
    });
    client.readContent = vi.fn((locale: string) => {
      order.push(`read-${locale}`);
      return Promise.resolve(ok({ revision: 9, locale, document: null }));
    });
    let writes = 0;
    client.writeLayout = vi.fn((_doc: unknown, revision: number) => {
      order.push(`write-layout-${String(revision)}`);
      writes += 1;
      return Promise.resolve(
        writes === 1
          ? { ok: false, error: { kind: 'http', status: 409, code: 'blixis_conflict' } }
          : ok({ revision: 10 }),
      );
    }) as never;
    client.writeContent = vi.fn((locale: string, _doc: unknown, revision: number) => {
      order.push(`write-${locale}-${String(revision)}`);
      return Promise.resolve(ok({ revision: 11 }));
    });
    store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: 3 } });
    store
      .getState()
      .dispatch({ type: 'set-translation', locale: 'en_US', elementId: 'el-heading-1', set: { text: 'Hi' } });
    await store.getState().saveDraft();
    await store.getState().resolveConflict('overwrite');
    expect(order).toEqual(['write-layout-5', 'read-layout', 'read-en_US', 'write-layout-8', 'write-en_US-9']);
    expect(store.getState().dirty).toEqual({ layout: false, content: { en_US: false, fr_FR: false } });
  });
});

describe('document slice: dirty tracking and markSaved', () => {
  const heading = { type: 'update-props', id: 'el-heading-1', set: { level: 3 } } as const;
  const translate = {
    type: 'set-translation',
    locale: 'en_US',
    elementId: 'el-heading-1',
    set: { text: 'Hi' },
  } as const;

  it('marks only the touched stream and is clean again after undoing back', async () => {
    const { store } = await makeLoadedStore();
    const { dispatch, undo } = store.getState();
    dispatch(heading);
    expect(store.getState().dirty).toEqual({ layout: true, content: { en_US: false, fr_FR: false } });
    undo();
    expect(store.getState().dirty).toEqual({ layout: false, content: { en_US: false, fr_FR: false } });
    dispatch(translate);
    expect(store.getState().dirty).toEqual({ layout: false, content: { en_US: true, fr_FR: false } });
  });

  it('marks every content stream a command touches (remove orphans entries)', async () => {
    const { store } = await makeLoadedStore();
    store.getState().dispatch({ type: 'remove', id: 'el-heading-1' });
    expect(store.getState().dirty.layout).toBe(true);
    expect(store.getState().dirty.content['en_US']).toBe(true);
  });

  it('keeps the dirty object identity while nothing changes', async () => {
    const { store } = await makeLoadedStore();
    const before = store.getState().dirty;
    store.getState().dispatch({ type: 'set-class-ids', id: 'el-text-1', classIds: null }); // no-op
    expect(store.getState().dirty).toBe(before);
  });

  it('markSaved clears the saved streams, records revisions and leaves the others dirty', async () => {
    const { store } = await makeLoadedStore();
    store.getState().dispatch(heading);
    store.getState().dispatch(translate);
    store.getState().markSaved({ layout: 6 });
    expect(store.getState().revisions).toEqual({ layout: 6, content: { en_US: 2, fr_FR: 2 } });
    expect(store.getState().dirty).toEqual({ layout: false, content: { en_US: true, fr_FR: false } });
    store.getState().markSaved({ content: { en_US: 3 } });
    expect(store.getState().revisions.content).toEqual({ en_US: 3, fr_FR: 2 });
    expect(isDirty(store.getState())).toBe(false);
    // Undo after a save is a new unsaved change.
    store.getState().undo();
    expect(store.getState().dirty.content['en_US']).toBe(true);
  });

  it('markSaved with the sent document keeps edits made while the save was in flight dirty', async () => {
    const { store } = await makeLoadedStore();
    store.getState().dispatch(heading);
    const sent = documentOf(store);
    store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: 4 } });
    store.getState().markSaved({ layout: 6, document: sent });
    expect(store.getState().dirty.layout).toBe(true);
    store.getState().markSaved({ layout: 7 });
    expect(store.getState().dirty.layout).toBe(false);
  });

  it('markSaved before a load does nothing', () => {
    const { store } = makeStore();
    store.getState().markSaved({ layout: 3 });
    expect(store.getState().revisions).toEqual({ layout: 0, content: {} });
  });
});

describe('selection slice', () => {
  it('validates against the document: a missing id is refused', async () => {
    const { store } = await makeLoadedStore();
    const { select } = store.getState();
    expect(select('el-nope-1')).toBe(false);
    expect(store.getState().selectedId).toBeNull();
    expect(select('el-text-1')).toBe(true);
    expect(store.getState().selectedId).toBe('el-text-1');
    expect(select('el-nope-1')).toBe(false);
    expect(store.getState().selectedId).toBe('el-text-1');
    expect(select(null)).toBe(true);
    expect(store.getState().selectedId).toBeNull();
  });

  it('refuses selection before a document is loaded', () => {
    const { store } = makeStore();
    expect(store.getState().select('el-text-1')).toBe(false);
  });

  it('hover is validated and clearSelection works', async () => {
    const { store } = await makeLoadedStore();
    store.getState().hover('el-text-1');
    expect(store.getState().hoveredId).toBe('el-text-1');
    store.getState().hover('el-nope-1');
    expect(store.getState().hoveredId).toBeNull();
    store.getState().select('el-text-1');
    store.getState().clearSelection();
    expect(store.getState().selectedId).toBeNull();
  });

  it('moves to the nearest surviving ancestor after a remove and stays there after undo', async () => {
    const { store } = await makeLoadedStore();
    store.getState().select('el-text-1');
    store.getState().dispatch({ type: 'remove', id: 'el-container-1' }); // removes the text too
    expect(store.getState().selectedId).toBe('el-section-1');
    store.getState().undo(); // the old selection is not resurrected
    expect(store.getState().selectedId).toBe('el-section-1');
  });

  it('clears the selection when no ancestor survives, also for a hovered element', async () => {
    const { store } = await makeLoadedStore();
    store.getState().select('el-section-2');
    store.getState().hover('el-section-2');
    store.getState().dispatch({ type: 'remove', id: 'el-section-2' });
    expect(store.getState().selectedId).toBeNull();
    expect(store.getState().hoveredId).toBeNull();
  });

  it('undoing an insert that is selected falls back to the parent', async () => {
    const { store } = await makeLoadedStore();
    store.getState().dispatch({
      type: 'insert',
      parentId: 'el-container-1',
      index: 0,
      element: { id: 'el-new-text-1', type: 'blixis/text', props: {}, children: [] },
    });
    store.getState().select('el-new-text-1');
    store.getState().undo();
    expect(store.getState().selectedId).toBe('el-container-1');
  });

  it('keeps a selection that still exists, also after a move and a load', async () => {
    const { store } = await makeLoadedStore();
    store.getState().select('el-text-1');
    store.getState().dispatch({ type: 'move', id: 'el-text-1', parentId: 'el-section-2', index: 0 });
    expect(store.getState().selectedId).toBe('el-text-1');
    await store.getState().loadDocument();
    expect(store.getState().selectedId).toBe('el-text-1');
  });

  it('clears a selection the freshly loaded document does not contain', async () => {
    const doc = makeDocument();
    const streams = { current: streamsOf(doc) };
    const contents = { ...streams.current.contents };
    const client = fakeClient({ layout: () => Promise.resolve(ok(streams.current.layout)), contents });
    const store = createEditorStore({ client, bootstrap: makeBootstrap(), storage: memoryStorage() });
    await store.getState().loadDocument();
    store.getState().select('el-text-1');
    streams.current = streamsOf(makeDocument({ root: [], translations: { en_US: {}, fr_FR: {} } }));
    Object.assign(contents, streams.current.contents);
    await store.getState().loadDocument();
    expect(store.getState().selectedId).toBeNull();
  });
});

describe('settings slice: four independent settings', () => {
  it('has sane defaults and maps viewports to breakpoints', () => {
    const { store } = makeStore();
    expect(store.getState()).toMatchObject({
      viewport: 'desktop',
      breakpointId: 'base',
      viewportWidth: null,
      previewMode: 'light',
      contentLocale: 'fr_FR',
      panels: { left: true, right: true },
    });
    store.getState().setViewport('tablet');
    expect(store.getState()).toMatchObject({ viewport: 'tablet', breakpointId: 'tablet', viewportWidth: 1024 });
    store.getState().setViewport('mobile');
    expect(store.getState()).toMatchObject({ breakpointId: 'mobile', viewportWidth: 640 });
    store.getState().setViewport('bogus' as never);
    expect(store.getState().viewport).toBe('mobile');
  });

  it('uses an injected breakpoint registry', () => {
    const { store } = makeStore({
      deps: {
        breakpoints: {
          viewports: {
            desktop: { breakpoint: 'base', width: null },
            tablet: { breakpoint: 'md', width: 900 },
            mobile: { breakpoint: 'sm', width: 480 },
          },
        },
      },
    });
    store.getState().setViewport('tablet');
    expect(store.getState()).toMatchObject({ breakpointId: 'md', viewportWidth: 900 });
  });

  it('content locale must be enabled and never touches the chrome language or <html>', () => {
    const htmlBefore = document.documentElement.getAttributeNames();
    localStorage.setItem(CHROME_STORAGE_KEY, 'dark');
    const { store } = makeStore({ bootstrap: { editorLocale: 'nl_NL', enabledLocales: ['en_US', 'fr_FR', 'de_DE'] } });
    expect(store.getState().setContentLocale('de_DE')).toBe(true);
    expect(store.getState().contentLocale).toBe('de_DE');
    expect(store.getState().setContentLocale('xx_XX')).toBe(false);
    expect(store.getState().setContentLocale('__proto__')).toBe(false);
    expect(store.getState().contentLocale).toBe('de_DE');
    expect(localStorage.getItem(CHROME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.getAttributeNames()).toEqual(htmlBefore);
  });

  it('preview mode (website content) is independent of the chrome theme storage and <html>', () => {
    const htmlBefore = document.documentElement.getAttributeNames();
    const { store } = makeStore();
    store.getState().setPreviewMode('dark');
    expect(store.getState().previewMode).toBe('dark');
    expect(localStorage.getItem(CHROME_STORAGE_KEY)).toBeNull();
    expect(document.documentElement.getAttributeNames()).toEqual(htmlBefore);
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    // And the other way round: a chrome change in storage does not reach the store.
    localStorage.setItem(CHROME_STORAGE_KEY, 'light');
    expect(store.getState().previewMode).toBe('dark');
    store.getState().setPreviewMode('sepia' as never);
    expect(store.getState().previewMode).toBe('dark');
  });

  it('keeps the settings across document changes, and the document across settings changes', async () => {
    const { store } = await makeLoadedStore();
    const doc = store.getState().document;
    store.getState().setViewport('mobile');
    store.getState().setPreviewMode('dark');
    store.getState().setContentLocale('en_US');
    expect(store.getState().document).toBe(doc);
    store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: 3 } });
    expect(store.getState()).toMatchObject({ viewport: 'mobile', previewMode: 'dark', contentLocale: 'en_US' });
  });

  it('toggles panels under the existing panels key', () => {
    const { store } = makeStore();
    store.getState().togglePanel('left');
    expect(store.getState().panels).toEqual({ left: false, right: true });
    expect(JSON.parse(localStorage.getItem(PANELS_STORAGE_KEY) ?? '{}')).toEqual({ left: false, right: true });
    expect(makeStore().store.getState().panels).toEqual({ left: false, right: true });
  });
});

describe('settings slice: persistence per post', () => {
  const key = viewStorageKey(42);

  it('remembers viewport, preview mode and content locale under blixis-editor-view-<postId>', () => {
    const { store, storage } = makeStore();
    store.getState().setViewport('tablet');
    store.getState().setPreviewMode('dark');
    store.getState().setContentLocale('en_US');
    expect(key).toBe('blixis-editor-view-42');
    expect(JSON.parse(storage.data.get(key) ?? '{}')).toEqual({
      viewport: 'tablet',
      previewMode: 'dark',
      contentLocale: 'en_US',
    });
  });

  it('restores valid values; an explicit non-default bootstrap locale wins over the remembered one', () => {
    const stored = JSON.stringify({ viewport: 'mobile', previewMode: 'dark', contentLocale: 'fr_FR' });
    const restored = createEditorStore({
      client: fakeClient({ layout: { revision: 0, locale: null, document: null }, contents: {} }),
      bootstrap: makeBootstrap({ contentLocale: 'en_US' }),
      storage: memoryStorage({ [key]: stored }),
    });
    expect(restored.getState()).toMatchObject({ viewport: 'mobile', previewMode: 'dark', contentLocale: 'fr_FR' });
    const explicit = makeStore({
      bootstrap: { contentLocale: 'fr_FR', contentLocaleExplicit: true },
      deps: { storage: memoryStorage({ [key]: JSON.stringify({ contentLocale: 'en_US' }) }) },
    });
    expect(explicit.store.getState().contentLocale).toBe('fr_FR');
    // Not flagged explicit (a generic link): the remembered locale wins, even over a non-default bootstrap locale.
    const generic = makeStore({
      bootstrap: { contentLocale: 'fr_FR' },
      deps: { storage: memoryStorage({ [key]: JSON.stringify({ contentLocale: 'en_US' }) }) },
    });
    expect(generic.store.getState().contentLocale).toBe('en_US');
    // Nothing remembered: the bootstrap locale. An explicit but disabled locale falls back to the remembered one.
    expect(makeStore({ bootstrap: { contentLocale: 'fr_FR' } }).store.getState().contentLocale).toBe('fr_FR');
    const disabled = makeStore({
      bootstrap: { contentLocale: 'de_DE', contentLocaleExplicit: true },
      deps: { storage: memoryStorage({ [key]: JSON.stringify({ contentLocale: 'fr_FR' }) }) },
    });
    expect(disabled.store.getState().contentLocale).toBe('fr_FR');
  });

  it.each([
    ['not json', '{nope'],
    ['an array', '[1,2]'],
    ['a string', '"x"'],
    ['null', 'null'],
    ['wrong types', JSON.stringify({ viewport: 7, previewMode: {}, contentLocale: ['fr_FR'] })],
    ['unknown values', JSON.stringify({ viewport: 'tv', previewMode: 'sepia', contentLocale: 'xx_XX' })],
    ['a reserved key', '{"__proto__": {"viewport": "mobile"}}'],
    ['oversized', JSON.stringify({ viewport: 'mobile', pad: 'x'.repeat(2000) })],
  ])('ignores garbage (%s)', (_, raw) => {
    const { store } = makeStore({ deps: { storage: memoryStorage({ [key]: raw }) } });
    expect(store.getState()).toMatchObject({ viewport: 'desktop', previewMode: 'light', contentLocale: 'fr_FR' });
  });

  it('survives unavailable storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const store = createEditorStore({
      client: fakeClient({ layout: { revision: 0, locale: null, document: null }, contents: {} }),
      bootstrap: makeBootstrap(),
    });
    expect(() => {
      store.getState().setViewport('mobile');
      store.getState().togglePanel('right');
    }).not.toThrow();
    expect(store.getState().viewport).toBe('mobile');
  });
});
