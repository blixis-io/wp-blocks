import type { BuilderDocument, ElementNode } from '@blixis/wp-core';
import type { ApiResult, RestClient, StreamRead } from '../state/deps';
import { splitDocument } from '../state/compose';
import { createEditorStore, type EditorStore, type EditorStoreDeps } from '../state';
import type { KeyValueStorage } from '../state/context';
import { makeBootstrap } from './fixtures';

export const el = (
  id: string,
  type: string,
  children: ElementNode[] = [],
  props: ElementNode['props'] = {},
): ElementNode => ({
  id,
  type,
  props,
  children,
});

/** section > container > heading + text, plus a second section with a button. Types the core registry accepts. */
export function makeDocument(overrides: Partial<BuilderDocument> = {}): BuilderDocument {
  return {
    schemaVersion: 1,
    documentId: 'post-42',
    layoutRevision: 3,
    defaultLocale: 'en_US',
    locales: ['en_US', 'fr_FR'],
    root: [
      el('el-section-1', 'blixis/section', [
        el('el-container-1', 'blixis/container', [
          el('el-heading-1', 'blixis/heading', [], { level: 2 }),
          el('el-text-1', 'blixis/text'),
        ]),
      ]),
      el('el-section-2', 'blixis/section', [el('el-button-1', 'blixis/button')]),
    ],
    classListVersion: 0,
    classRefs: {},
    translations: {
      en_US: {
        'el-heading-1': { values: { text: 'Hello' }, status: 'translated' },
        'el-text-1': { values: { text: 'World' }, status: 'translated' },
      },
      fr_FR: {},
    },
    metadata: { updatedAt: '2026-01-01T00:00:00Z', editorVersion: '0.1.0' },
    ...overrides,
  };
}

export const ok = <T>(value: T): ApiResult<T> => ({ ok: true, value });

export function streamsOf(doc: BuilderDocument, layoutRevision = 5, contentRevision = 2) {
  const { layout, contents } = splitDocument(doc);
  const layoutRead: StreamRead = { revision: layoutRevision, locale: null, document: layout };
  const contentReads: Record<string, StreamRead> = {};
  for (const [locale, envelope] of Object.entries(contents)) {
    contentReads[locale] = { revision: contentRevision, locale, document: { ...envelope } };
  }
  return { layout: layoutRead, contents: contentReads };
}

export interface FakeClient extends RestClient {
  layoutCalls: number;
  contentCalls: string[];
}

/** A REST client over fixed streams. `layout`/`content` may be replaced by functions to delay or fail a read. */
export function fakeClient(streams: {
  layout: StreamRead | (() => Promise<ApiResult<StreamRead>>);
  contents: Record<string, StreamRead>;
}): FakeClient {
  const unsupported = (): Promise<never> => Promise.reject(new Error('not used by the state tests'));
  const client: FakeClient = {
    layoutCalls: 0,
    contentCalls: [],
    readLayout(options) {
      client.layoutCalls += 1;
      if (options?.signal?.aborted === true) return Promise.resolve({ ok: false, error: { kind: 'aborted' } });
      return typeof streams.layout === 'function' ? streams.layout() : Promise.resolve(ok(streams.layout));
    },
    readContent(locale, options) {
      client.contentCalls.push(locale);
      if (options?.signal?.aborted === true) return Promise.resolve({ ok: false, error: { kind: 'aborted' } });
      const read = streams.contents[locale];
      return Promise.resolve(read === undefined ? ok({ revision: 0, locale, document: null }) : ok(read));
    },
    writeLayout: unsupported,
    writeContent: unsupported,
    listRevisions: unsupported,
    readPublication: unsupported,
  };
  return client;
}

export function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    read: (key) => data.get(key) ?? null,
    write: (key, value) => {
      data.set(key, value);
    },
  };
}

export function manualClock(start = 1_700_000_000_000) {
  let time = start;
  return {
    now: () => time,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

export interface TestStore {
  store: EditorStore;
  client: FakeClient;
  clock: ReturnType<typeof manualClock>;
  storage: ReturnType<typeof memoryStorage>;
  document: BuilderDocument;
}

/** An isolated store over a fake client; `load` it before dispatching. */
export function makeStore(
  options: {
    document?: BuilderDocument;
    deps?: Partial<EditorStoreDeps>;
    bootstrap?: Parameters<typeof makeBootstrap>[0];
  } = {},
): TestStore {
  const document = options.document ?? makeDocument();
  const client = fakeClient(streamsOf(document));
  const clock = manualClock();
  const storage = memoryStorage();
  const store = createEditorStore({
    client,
    bootstrap: makeBootstrap(options.bootstrap),
    now: clock.now,
    storage,
    ...options.deps,
  });
  return { store, client, clock, storage, document };
}

export async function makeLoadedStore(options: Parameters<typeof makeStore>[0] = {}): Promise<TestStore> {
  const made = makeStore(options);
  await made.store.getState().loadDocument();
  return made;
}

/** The loaded document of a store; fails the test when nothing is loaded. */
export function documentOf(store: EditorStore): BuilderDocument {
  const doc = store.getState().document;
  if (doc === null) throw new Error('no document loaded');
  return doc;
}
