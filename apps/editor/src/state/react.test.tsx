import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EditorApp } from '../App';
import { CHROME_STORAGE_KEY } from '../chrome-theme';
import { axeViolations } from '../test/axe';
import { makeBootstrap } from '../test/fixtures';
import { fakeClient, makeDocument, makeStore, ok, streamsOf } from '../test/state-helpers';
import { createEditorStore, StoreProvider, useEditorStore } from './index';

function mount(options: Parameters<typeof makeStore>[0] = {}) {
  const made = makeStore(options);
  const bootstrap = makeBootstrap(options.bootstrap);
  const view = render(<EditorApp bootstrap={bootstrap} store={made.store} />);
  return { ...made, ...view, user: userEvent.setup() };
}

const ready = async () =>
  act(async () => {
    await Promise.resolve();
  });

describe('React glue', () => {
  it('throws outside a provider', () => {
    const Probe = () => <p>{useEditorStore((state) => state.status)}</p>;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow(/StoreProvider/);
  });

  it('re-renders a component only when its selected value changes (no loops)', async () => {
    const { store } = makeStore();
    await store.getState().loadDocument();
    let renders = 0;
    const Probe = () => {
      renders += 1;
      const hovered = useEditorStore((state) => state.hoveredId);
      const level = useEditorStore((state) =>
        Number(state.document?.root[0]?.children[0]?.children[0]?.props['level']),
      );
      return <p data-testid="probe">{`${String(hovered)}:${String(level)}`}</p>;
    };
    render(
      <StoreProvider store={store}>
        <Probe />
      </StoreProvider>,
    );
    const initial = renders;
    act(() => {
      store.getState().select('el-text-1'); // unrelated to the selected values
      store.getState().setPreviewMode('dark');
    });
    expect(renders).toBe(initial);
    act(() => {
      store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: 4 } });
    });
    expect(screen.getByTestId('probe').textContent).toBe('null:4');
    expect(renders).toBe(initial + 1);
  });
});

describe('Structure panel and inspector header', () => {
  it('counts page settings as unsaved and opens the empty-selection Page panel from the title', async () => {
    const { user, store } = mount();
    await ready();
    await act(async () => store.getState().loadPageSettings());
    act(() => {
      store.getState().updatePageSettings({ title: 'A changed title' });
    });
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save Draft' }).getAttribute('aria-disabled')).toBe('false');
    await user.click(screen.getByRole('button', { name: 'About us' }));
    expect(store.getState().selectedId).toBeNull();
    expect(screen.getByRole('tab', { name: 'Page' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('region', { name: 'Page' })).toBeTruthy();
    store.getState().select('el-heading-1');
    await user.click(screen.getByRole('button', { name: 'Pages' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Page settings' }));
    expect(store.getState().selectedId).toBe('el-heading-1');
  });
  it('shows a loading state, then a nested outline of the document', async () => {
    const { store } = makeStore();
    render(<EditorApp bootstrap={makeBootstrap()} store={store} />);
    expect(screen.getByText('Loading the document...')).toBeTruthy();
    await ready();
    const tree = screen.getByRole('tree', { name: 'Page elements' });
    expect(within(tree).getAllByRole('treeitem')).toHaveLength(6);
    expect(screen.getByRole('treeitem', { name: /^Heading\s+el-heading-1$/ }).getAttribute('aria-level')).toBe('3');
    expect(screen.getByRole('treeitem', { name: /^Section\s+el-section-1$/ })).toBeTruthy();
    expect(screen.getByRole('treeitem', { name: /^Section\s+el-section-2$/ })).toBeTruthy();
  });

  it('selects on click, marks aria-current and shows type and id in the inspector', async () => {
    const { user, store } = mount();
    await ready();
    expect(screen.getByTestId('inspector-selection').textContent).toBe('');
    const heading = screen.getByRole('treeitem', { name: /el-heading-1/ });
    expect(heading.getAttribute('aria-selected')).toBe('false');
    await user.click(heading);
    expect(store.getState().selectedId).toBe('el-heading-1');
    expect(heading.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('inspector-selection').textContent).toBe('Selected element: Heading el-heading-1');
    await user.click(screen.getByRole('treeitem', { name: /el-text-1/ }));
    expect(heading.getAttribute('aria-selected')).toBe('false');
    expect(screen.getAllByRole('treeitem', { selected: true })).toHaveLength(1);
  });

  it('selects with the keyboard (Enter and Space)', async () => {
    const { user, store } = mount();
    await ready();
    screen.getByRole('treeitem', { name: /el-button-1/ }).focus();
    await user.keyboard('{Enter}');
    expect(store.getState().selectedId).toBe('el-button-1');
    screen.getByRole('treeitem', { name: /el-text-1/ }).focus();
    await user.keyboard(' ');
    expect(store.getState().selectedId).toBe('el-text-1');
  });

  it('supports tree navigation, focus independent of selection, and sibling position semantics', async () => {
    const { user, store } = mount();
    await ready();
    const section = screen.getByRole('treeitem', { name: /el-section-1/ });
    const container = screen.getByRole('treeitem', { name: /el-container-1/ });
    expect(section.getAttribute('aria-posinset')).toBe('1');
    expect(section.getAttribute('aria-setsize')).toBe('2');
    expect(container.getAttribute('aria-posinset')).toBe('1');
    expect(container.getAttribute('aria-setsize')).toBe('1');
    section.focus();
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(container);
    act(() => {
      store.getState().select('el-button-1');
    });
    expect(container.getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('treeitem', { name: /el-button-1/ }).getAttribute('tabindex')).toBe('-1');
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(section);
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(screen.getByRole('treeitem', { name: /el-button-1/ }));
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(screen.getByRole('treeitem', { name: /el-section-2/ }));
  });

  it('Right enters the first child after expansion and Left collapses without losing focus', async () => {
    const { user, store } = mount();
    await ready();
    const sectionTwo = screen.getByRole('treeitem', { name: /el-section-2/ });
    act(() => {
      store.getState().setExpanded('el-section-2', false);
    });
    sectionTwo.focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(sectionTwo);
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(screen.getByRole('treeitem', { name: /el-button-1/ }));
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(sectionTwo);
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(sectionTwo);
    expect(screen.queryByRole('treeitem', { name: /el-button-1/ })).toBeNull();
  });

  it('swaps tree expand and collapse keys with the editor chrome direction in RTL', async () => {
    const { user, store } = mount({ bootstrap: { editorLocale: 'ar' } });
    await ready();
    const sectionTwo = screen.getByRole('treeitem', { name: /el-section-2/ });
    act(() => {
      store.getState().setExpanded('el-section-2', false);
    });
    sectionTwo.focus();
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(sectionTwo);
    expect(screen.getByRole('treeitem', { name: /el-button-1/ })).toBeTruthy();
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(screen.getByRole('treeitem', { name: /el-button-1/ }));
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(sectionTwo);
    await user.keyboard('{ArrowRight}');
    expect(screen.queryByRole('treeitem', { name: /el-button-1/ })).toBeNull();
    expect(document.activeElement).toBe(sectionTwo);
  });

  it('expands the selected element ancestors together when selection comes from the canvas', async () => {
    const { store } = mount();
    await ready();
    act(() => {
      store.getState().setExpanded('el-container-1', false);
    });
    expect(screen.queryByRole('treeitem', { name: /el-heading-1/ })).toBeNull();
    act(() => {
      store.getState().select('el-heading-1');
    });
    expect(screen.getByRole('treeitem', { name: /el-heading-1/ })).toBeTruthy();
    expect(store.getState().expandedIds).toContain('el-container-1');
  });

  it('follows selection repair: removing the selected element moves the highlight to its parent', async () => {
    const { store } = mount();
    await ready();
    act(() => {
      store.getState().select('el-text-1');
    });
    act(() => {
      store.getState().dispatch({ type: 'remove', id: 'el-text-1' });
    });
    expect(screen.getByRole('treeitem', { selected: true }).textContent).toContain('el-container-1');
    expect(screen.getByTestId('inspector-selection').textContent).toBe('Selected element: Container el-container-1');
    expect(screen.queryByRole('treeitem', { name: /el-text-1/ })).toBeNull();
  });

  it('shows an empty state for a document without elements', async () => {
    mount({ document: makeDocument({ root: [], translations: { en_US: {}, fr_FR: {} } }) });
    await ready();
    expect(screen.getByText('This page has no elements yet.')).toBeTruthy();
  });

  it.each([
    ['401', { kind: 'http', status: 401 }, 'Your session has expired. Reload the page and sign in again.'],
    ['403', { kind: 'http', status: 403, code: 'blixis_forbidden' }, 'You are not allowed to edit this page.'],
    [
      '403 nonce',
      { kind: 'http', status: 403, code: 'rest_cookie_invalid_nonce' },
      'Your session has expired. Reload the page and sign in again.',
    ],
    ['409', { kind: 'http', status: 409 }, 'The document was changed elsewhere. Reload the page.'],
    ['423', { kind: 'http', status: 423 }, 'This document is locked by another editing session.'],
    ['network', { kind: 'network' }, 'The server could not be reached. Check the connection and try again.'],
    ['invalid response', { kind: 'invalid-response' }, 'The saved document is not valid and was not loaded.'],
    [
      '500',
      { kind: 'http', status: 500, data: { secret: 'SQL error near x' } },
      'Something went wrong while loading the document. Try again later.',
    ],
  ])('shows a generic alert for %s without leaking server details', async (_, error, text) => {
    const doc = makeDocument();
    const client = fakeClient({
      layout: () => Promise.resolve({ ok: false, error } as never),
      contents: streamsOf(doc).contents,
    });
    const store = createEditorStore({ client, bootstrap: makeBootstrap(), storage: undefined as never });
    render(<EditorApp bootstrap={makeBootstrap()} store={store} />);
    await ready();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('The document could not be loaded.');
    expect(alert.textContent).toContain(text);
    expect(alert.textContent).not.toMatch(/SQL|secret|blixis_/);
  });

  it('shows invalid documents generically, in Dutch, and can retry', async () => {
    const doc = makeDocument();
    const streams = streamsOf(doc);
    let bad = true;
    const client = fakeClient({
      layout: () => Promise.resolve(ok(bad ? { ...streams.layout, document: { nonsense: true } } : streams.layout)),
      contents: streams.contents,
    });
    const bootstrap = makeBootstrap({ editorLocale: 'nl_NL' });
    const store = createEditorStore({ client, bootstrap });
    const user = userEvent.setup();
    render(<EditorApp bootstrap={bootstrap} store={store} />);
    await ready();
    expect(screen.getByRole('alert').textContent).toContain('Het opgeslagen document is ongeldig en is niet geladen.');
    expect(screen.getByRole('alert').textContent).not.toContain('nonsense');
    bad = false;
    await user.click(screen.getByRole('button', { name: 'Opnieuw proberen' }));
    await ready();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('tree', { name: 'Pagina-elementen' })).toBeTruthy();
  });

  it('has no axe violations while loading, with an outline and a selection, and in the error state', async () => {
    const { store, unmount } = mount();
    expect(await axeViolations()).toEqual([]);
    await ready();
    act(() => {
      store.getState().select('el-heading-1');
    });
    expect(await axeViolations()).toEqual([]);
    unmount();
    const client = fakeClient({
      layout: () => Promise.resolve({ ok: false, error: { kind: 'network' } }),
      contents: {},
    });
    render(<EditorApp bootstrap={makeBootstrap()} store={createEditorStore({ client, bootstrap: makeBootstrap() })} />);
    await ready();
    expect(await axeViolations()).toEqual([]);
  });
});

describe('toolbar undo and redo', () => {
  it('start disabled and follow canUndo / canRedo', async () => {
    const { store } = mount();
    await ready();
    const undo = screen.getByRole('button', { name: 'Undo' });
    const redo = screen.getByRole('button', { name: 'Redo' });
    expect(undo.getAttribute('aria-disabled')).toBe('true');
    expect(redo.getAttribute('aria-disabled')).toBe('true');
    act(() => {
      store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: 3 } });
    });
    expect(undo.getAttribute('aria-disabled')).toBeNull();
    expect(redo.getAttribute('aria-disabled')).toBe('true');
  });

  it('work by click and by keyboard, and nothing else is bound globally', async () => {
    const { store, user } = mount();
    await ready();
    const level = () => store.getState().document?.root[0]?.children[0]?.children[0]?.props['level'];
    act(() => {
      store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: 3 } });
    });
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(level()).toBe(2);
    expect(screen.getByRole('button', { name: 'Redo' }).getAttribute('aria-disabled')).toBeNull();
    screen.getByRole('button', { name: 'Redo' }).focus();
    await user.keyboard('{Enter}');
    expect(level()).toBe(3);
    await user.keyboard('{Control>}z{/Control}'); // Mod+Z is BWB-056, not part of this change
    await user.keyboard('{Meta>}z{/Meta}');
    expect(level()).toBe(3);
    await user.click(screen.getByRole('button', { name: 'Redo' })); // disabled: nothing happens
    expect(level()).toBe(3);
    screen.getByRole('button', { name: 'Undo' }).focus();
    await user.keyboard(' ');
    expect(level()).toBe(2);
  });

  it('stay disabled for a locked document', async () => {
    const { store } = mount({ bootstrap: { editingEnabled: false, lockReason: 'x' } });
    await ready();
    expect(store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: 3 } }).ok).toBe(false);
    expect(screen.getByRole('button', { name: 'Undo' }).getAttribute('aria-disabled')).toBe('true');
  });
});

describe('four independent settings in the UI', () => {
  it('chrome theme and editor locale never change previewMode or contentLocale, and vice versa', async () => {
    const htmlBefore = document.documentElement.getAttributeNames();
    const { store, user } = mount({ bootstrap: { editorLocale: 'nl_NL', contentLocale: 'fr_FR' } });
    await ready();
    const root = screen.getByTestId('editor-root');
    expect(screen.getByTestId('content-locale').textContent).toContain('fr_FR');
    await user.click(screen.getByRole('button', { name: 'Meer opties' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Weergave van de editor: Donker' }));
    expect(localStorage.getItem(CHROME_STORAGE_KEY)).toBe('dark');
    expect(root.getAttribute('data-editor-theme')).toBe('dark');
    expect(store.getState()).toMatchObject({ previewMode: 'light', contentLocale: 'fr_FR' });
    act(() => {
      store.getState().setPreviewMode('dark');
      store.getState().setContentLocale('en_US');
    });
    expect(screen.getByTestId('content-locale').textContent).toContain('en_US');
    expect(root.getAttribute('data-editor-theme')).toBe('dark');
    expect(root.getAttribute('lang')).toBe('nl-NL'); // the editor language did not follow the content language
    expect(localStorage.getItem(CHROME_STORAGE_KEY)).toBe('dark');
    await user.click(screen.getByRole('button', { name: 'Meer opties' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Weergave van de editor: Licht' }));
    expect(store.getState()).toMatchObject({ previewMode: 'dark', contentLocale: 'en_US' });
    expect(document.documentElement.getAttributeNames()).toEqual(htmlBefore);
  });

  it('the viewport toggle writes to the settings slice', async () => {
    const { store, user } = mount();
    await user.click(screen.getByRole('radio', { name: 'Mobile' }));
    expect(store.getState()).toMatchObject({ viewport: 'mobile', breakpointId: 'mobile' });
    expect(screen.getByRole('radio', { name: 'Mobile' }).getAttribute('aria-checked')).toBe('true');
  });
});
