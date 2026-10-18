import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { EditorApp } from './App';
import { makeBootstrap } from './test/fixtures';
import { makeDocument, makeStore, el } from './test/state-helpers';
import { axeViolations } from './test/axe';

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('Expected test element to exist');
  return value;
}

async function openElements(user: ReturnType<typeof userEvent.setup>) {
  const tab = document.querySelectorAll<HTMLElement>('#blx-structure [role="tab"]')[1];
  await user.click(required(tab));
}

function renderEditor(
  options: { editorLocale?: string; editingEnabled?: boolean; document?: ReturnType<typeof makeDocument> } = {},
) {
  const { store } = makeStore({
    ...(options.document === undefined ? {} : { document: options.document }),
    bootstrap: {
      ...(options.editorLocale === undefined ? {} : { editorLocale: options.editorLocale }),
      ...(options.editingEnabled === undefined ? {} : { editingEnabled: options.editingEnabled }),
    },
  });
  const view = render(<EditorApp bootstrap={makeBootstrap(options)} store={store} />);
  return { store, ...view };
}

describe('left panel and element palette', () => {
  beforeEach(() => {
    sessionStorage.removeItem('blixis-left-tab');
  });
  it('highlights only the selected tree row and never paints the ancestor guide path', async () => {
    renderEditor();
    await waitFor(() => {
      expect(screen.getByRole('tree')).toBeTruthy();
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole('treeitem', { name: /el-heading-1/ }));
    const rows = screen.getAllByRole('treeitem');
    const selected = rows.find((row) => row.getAttribute('aria-selected') === 'true');
    expect(selected?.getAttribute('data-id')).toBe('el-heading-1');
    expect(rows.every((row) => !row.hasAttribute('data-on-path'))).toBe(true);
  });

  it('indents tree rows from aria-level and renders decorative RTL-safe guide marks', async () => {
    renderEditor();
    const rows = await screen.findAllByRole('treeitem');
    const parent = rows.find((row) => row.getAttribute('aria-level') === '1');
    const child = rows.find((row) => row.getAttribute('aria-level') === '2');
    expect(parent).toBeTruthy();
    expect(child).toBeTruthy();
    const parentRow = required(parent);
    const childRow = required(child);
    expect(parentRow.style.getPropertyValue('--tree-depth')).toBe('0');
    expect(childRow.style.getPropertyValue('--tree-depth')).toBe('1');
    expect(childRow.style.getPropertyValue('--tree-level')).toBe('2');
    expect(child?.querySelector('.blx-tree-guides')?.getAttribute('aria-hidden')).toBe('true');
    const guides = child?.querySelectorAll('.blx-tree-guide');
    expect(guides).toHaveLength(1);
    expect(guides?.[0]?.getAttribute('data-guide-stop')).toBe('false');
    expect(guides?.[0]?.getAttribute('style')).toContain('--guide-depth: 0');
    const grandchild = rows.find((row) => row.getAttribute('aria-level') === '3');
    expect(grandchild?.querySelectorAll('.blx-tree-guide')).toHaveLength(2);
    expect(parentRow.querySelector('.blx-tree-guides')).toBeNull();
  });

  it('renders one tab strip with Structure and Elements and shows cards on the Elements tab', async () => {
    renderEditor();
    await waitFor(() => {
      expect(screen.getByRole('tree')).toBeTruthy();
    });
    expect(screen.getByRole('tab', { name: 'Structure' })).toBeTruthy();
    expect(within(screen.getByRole('tablist', { name: 'Structure and elements' })).getAllByRole('tab')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Structure panel' })).toBeTruthy();
    const user = userEvent.setup();
    await openElements(user);
    const palette = screen.getByRole('region', { name: 'Elements' });
    for (const name of [
      'Section',
      'Container',
      'Flex',
      'Aspect Ratio',
      'Scroll Area',
      'Sticky Container',
      'Split Layout',
      'Resizable Panels',
      'Marquee Layout',
      'Icon List',
      'Icon',
      'Icon Svg',
      'Icon Button',
      'Picture',
      'Before After',
      'Image Comparison',
      'Gallery',
      'Lightbox',
      'Code Block',
      'Syntax Highlighter',
      'Countdown',
      'Animated Headline',
      'Gradient Text',
      'Tooltip Text',
      'Post Title',
      'Post Content',
      'Post Excerpt',
      'Post Date',
      'Post Author',
      'Site Tagline',
      'Post Terms',
      'Heading',
      'Text',
      'Image',
      'Button',
      'Alert',
      'Table Of Contents',
    ])
      expect(within(palette).getByRole('button', { name })).toBeTruthy();
    expect(within(palette).getAllByRole('button')).toHaveLength(68);
  });

  it('remembers the selected left tab for the current session', async () => {
    const user = userEvent.setup();
    const first = renderEditor();
    await openElements(user);
    first.unmount();
    renderEditor();
    expect(screen.getByRole('tab', { name: 'Elements' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByRole('tree')).toBeNull();
  });

  it('filters the tree by type, id and label and reports match count; Escape clears', async () => {
    const user = userEvent.setup();
    renderEditor();
    await waitFor(() => {
      expect(screen.getByRole('tree')).toBeTruthy();
    });
    const search = required(screen.getAllByRole('textbox', { name: 'Search elements...' })[0]);
    await user.type(search, 'el-heading-1');
    expect(screen.getByRole('treeitem', { name: /Heading/ })).toBeTruthy();
    expect(screen.getByRole('treeitem', { name: /Section/ })).toBeTruthy();
    expect(screen.getByText('1 matching elements')).toBeTruthy();
    await user.keyboard('{Escape}');
    expect((search as HTMLInputElement).value).toBe('');
  });

  it('dispatches remove from the row menu and retains tree keyboard focus behavior', async () => {
    const user = userEvent.setup();
    const { store } = renderEditor();
    await waitFor(() => {
      expect(screen.getByRole('tree')).toBeTruthy();
    });
    await user.click(required(document.querySelector('[data-id="el-section-1"] [aria-label="Element actions"]')));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(store.getState().canUndo).toBe(true);
  });

  it('inserts as selected child when valid and undo removes it', async () => {
    const user = userEvent.setup();
    const { store } = renderEditor();
    await waitFor(() => {
      expect(store.getState().document).not.toBeNull();
    });
    act(() => {
      store.getState().select('el-container-1');
    });
    await openElements(user);
    await user.click(required(document.querySelector('[data-element-type="blixis/text"]')));
    await waitFor(() => {
      expect(store.getState().selectedId).toMatch(/^el-new-/);
    });
    const insertedId = store.getState().selectedId;
    expect(store.getState().document?.root[0]?.children[0]?.children.some((node) => node.id === insertedId)).toBe(true);
    act(() => {
      store.getState().undo();
    });
    expect(store.getState().document?.root[0]?.children[0]?.children.some((node) => node.id === insertedId)).toBe(
      false,
    );
  });

  it('appends to the last root container that accepts the element when nothing is selected', async () => {
    const user = userEvent.setup();
    const { store } = renderEditor({
      document: makeDocument({
        root: [el('el-section-a', 'blixis/section'), el('el-section-b', 'blixis/section')],
        translations: { en_US: {}, fr_FR: {} },
      }),
    });
    await waitFor(() => {
      expect(store.getState().document).not.toBeNull();
    });
    act(() => {
      store.getState().select(null);
    });
    await openElements(user);
    await user.click(required(document.querySelector('[data-element-type="blixis/text"]')));
    await waitFor(() => {
      expect(store.getState().selectedId).toMatch(/^el-new-/);
    });
    const root = store.getState().document?.root ?? [];
    const inserted = store.getState().selectedId;
    expect(root[0]?.children.some((node) => node.id === inserted)).toBe(false);
    expect(root[1]?.children.some((node) => node.id === inserted)).toBe(true);
  });

  it('chooses sibling placement when selected cannot contain the new element and root placement for a section', async () => {
    const user = userEvent.setup();
    const { store } = renderEditor({
      document: makeDocument({
        root: [el('el-heading-x', 'blixis/heading'), el('el-section-x', 'blixis/section')],
        translations: { en_US: {}, fr_FR: {} },
      }),
    });
    await waitFor(() => {
      expect(store.getState().document).not.toBeNull();
    });
    act(() => {
      store.getState().select('el-heading-x');
    });
    await openElements(user);
    await user.click(required(document.querySelector('[data-element-type="blixis/section"]')));
    expect(
      store.getState().document?.root.some((node) => node.type === 'blixis/section' && node.id.startsWith('el-new-')),
    ).toBe(true);
  });

  it('disables palette cards for locked documents', async () => {
    const user = userEvent.setup();
    renderEditor({ editingEnabled: false, editorLocale: 'nl_NL' });
    await waitFor(() => {
      expect(screen.getByRole('tree')).toBeTruthy();
    });
    await openElements(user);
    const textCard = required(document.querySelector('[data-element-type="blixis/text"]'));
    expect(textCard.getAttribute('aria-disabled')).toBe('true');
  });

  it('keeps the structure searchable and palette accessible in RTL chrome', async () => {
    const user = userEvent.setup();
    const { container } = renderEditor({ editorLocale: 'ar' });
    await waitFor(() => {
      expect(screen.getByRole('tree')).toBeTruthy();
    });
    expect(screen.getByTestId('editor-root').getAttribute('dir')).toBe('rtl');
    expect(await axeViolations(container)).toEqual([]);
    await openElements(user);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('provides a grid keyboard model that moves by columns', async () => {
    const user = userEvent.setup();
    renderEditor();
    await waitFor(() => {
      expect(screen.getByRole('tree')).toBeTruthy();
    });
    await openElements(user);
    const palette = required(document.querySelector<HTMLElement>('[data-element-type="blixis/section"]'));
    palette.focus();
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement?.textContent).toContain('Image');
  });

  it('keeps exact EN and NL catalog key parity', async () => {
    const en = await import('./messages/en_US');
    const nl = await import('./messages/nl_NL');
    expect(Object.keys(nl.nl_NL).sort()).toEqual(Object.keys(en.en_US).sort());
  });

  it.each([
    ['section label', 'Section', '2 matching elements'],
    ['heading type', 'blixis/heading', '1 matching elements'],
    ['nested id', 'el-heading-1', '1 matching elements'],
    ['nonexistent id', 'missing-node', '0 matching elements'],
  ])('searches by %s and keeps ancestor rows visible', async (_case, query, count) => {
    const user = userEvent.setup();
    renderEditor();
    await waitFor(() => {
      expect(screen.getByRole('tree')).toBeTruthy();
    });
    const search = required(screen.getAllByRole('textbox', { name: 'Search elements...' })[0]);
    await user.type(search, query);
    expect(screen.getByText(count)).toBeTruthy();
    if (query === 'el-heading-1' || query === 'blixis/heading') {
      expect(document.querySelector('[data-id="el-section-1"]')).toBeTruthy();
      expect(document.querySelector('[data-id="el-container-1"]')).toBeTruthy();
    }
  });

  it('removes the row selected from its actions menu through the command bridge', async () => {
    const user = userEvent.setup();
    const { store } = renderEditor();
    await waitFor(() => {
      expect(store.getState().document).not.toBeNull();
    });
    const row = document.querySelector('[data-id="el-section-2"]');
    await user.click(required(row?.querySelector('[aria-label="Element actions"]')));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(store.getState().document?.root.some((node) => node.id === 'el-section-2')).toBe(false);
    expect(store.getState().canUndo).toBe(true);
  });

  it('inserts a valid sibling immediately after the selected leaf', async () => {
    const user = userEvent.setup();
    const { store } = renderEditor();
    await waitFor(() => {
      expect(store.getState().document).not.toBeNull();
    });
    act(() => {
      store.getState().select('el-heading-1');
    });
    await openElements(user);
    const textCard = required(document.querySelector('[data-element-type="blixis/text"]'));
    await user.click(textCard);
    const siblings = store.getState().document?.root[0]?.children[0]?.children ?? [];
    expect(siblings[1]?.type).toBe('blixis/text');
    expect(store.getState().selectedId).toBe(siblings[1]?.id);
  });

  it('auto-expands ancestors after selecting a newly inserted child', async () => {
    const user = userEvent.setup();
    const { store } = renderEditor();
    await waitFor(() => {
      expect(store.getState().document).not.toBeNull();
    });
    act(() => {
      store.getState().select('el-container-1');
    });
    await openElements(user);
    await user.click(required(document.querySelector('[data-element-type="blixis/text"]')));
    await waitFor(() => {
      expect(store.getState().expandedIds).toContain('el-container-1');
    });
  });

  it('keeps palette cards disabled without a loaded document', async () => {
    const { store, client } = makeStore();
    client.readLayout = () => new Promise(() => undefined);
    const uninitialized = render(<EditorApp bootstrap={makeBootstrap()} store={store} />);
    const user = userEvent.setup();
    await openElements(user);
    expect(document.querySelector('[data-element-type="blixis/text"]')?.getAttribute('aria-disabled')).toBe('true');
    uninitialized.unmount();
  });

  it('remains within a generous 30 second bound when filtering a 5000 element document', async () => {
    const root = Array.from({ length: 5000 }, (_, index) => el(`el-section-${String(index)}`, 'blixis/section'));
    const { store } = renderEditor({ document: makeDocument({ root, translations: { en_US: {}, fr_FR: {} } }) });
    await waitFor(
      () => {
        expect(store.getState().document).not.toBeNull();
      },
      { timeout: 30_000 },
    );
    const start = performance.now();
    const search = required(screen.getAllByRole('textbox', { name: 'Search elements...' })[0]) as HTMLInputElement;
    // One change event: typing 15 characters re-filtered 5000 rows 15 times and ran ~10s locally, ~30s on CI runners.
    fireEvent.change(search, { target: { value: 'el-section-4999' } });
    await waitFor(
      () => {
        expect(screen.getByText('1 matching elements')).toBeTruthy();
      },
      { timeout: 30_000 },
    );
    expect(performance.now() - start).toBeLessThan(30_000);
  }, 60_000);

  it.each(['light', 'dark'] as const)('keeps the left panel axe clean in %s chrome', async (theme) => {
    const user = userEvent.setup();
    localStorage.setItem('blixis-editor-chrome', theme);
    const { container } = renderEditor();
    await waitFor(() => {
      expect(screen.getByRole('tree')).toBeTruthy();
    });
    expect(await axeViolations(container)).toEqual([]);
    await user.click(screen.getByRole('tab', { name: 'Elements' }));
    expect(await axeViolations(container)).toEqual([]);
    localStorage.removeItem('blixis-editor-chrome');
  });

  it.each([
    ['blixis/section', 'Section'],
    ['blixis/container', 'Container'],
    ['blixis/heading', 'Heading'],
    ['blixis/text', 'Text'],
    ['blixis/image', 'Image'],
    ['blixis/button', 'Button'],
  ])('exposes registered palette type %s with its editor label', async (type, label) => {
    const user = userEvent.setup();
    renderEditor();
    await waitFor(() => {
      expect(screen.getByRole('tree')).toBeTruthy();
    });
    await openElements(user);
    const card = document.querySelector(`[data-element-type="${type}"]`);
    expect(required(card).textContent.trim()).toBe(label);
    expect(required(card).hasAttribute('aria-disabled')).toBe(true);
  });

  it.each([
    ['blixis/section', null],
    ['blixis/container', 'el-section-1'],
    ['blixis/heading', 'el-container-1'],
    ['blixis/text', 'el-container-1'],
    ['blixis/image', 'el-container-1'],
    ['blixis/button', 'el-container-1'],
    ['blixis/div', 'el-container-1'],
    ['blixis/spacer', 'el-container-1'],
    ['blixis/separator', 'el-container-1'],
    ['blixis/list', 'el-container-1'],
    ['blixis/link', 'el-container-1'],
    ['blixis/steps', 'el-container-1'],
    ['blixis/breadcrumbs', 'el-container-1'],
    ['blixis/pagination', 'el-container-1'],
    ['blixis/paragraph', 'el-container-1'],
    ['blixis/rich-text', 'el-container-1'],
    ['blixis/eyebrow', 'el-container-1'],
    ['blixis/blockquote', 'el-container-1'],
    ['blixis/badge', 'el-container-1'],
    ['blixis/button-group', 'el-container-1'],
    ['blixis/counter', 'el-container-1'],
    ['blixis/progress-ring', 'el-container-1'],
    ['blixis/highlight-text', 'el-container-1'],
    ['blixis/progress', 'el-container-1'],
    ['blixis/spinner', 'el-container-1'],
    ['blixis/skeleton', 'el-container-1'],
  ])('inserts %s with only the registered invariant defaults', async (type, parent) => {
    const user = userEvent.setup();
    const { store } = renderEditor();
    await waitFor(() => {
      expect(store.getState().document).not.toBeNull();
    });
    if (parent)
      act(() => {
        store.getState().select(parent);
      });
    await openElements(user);
    await user.click(required(document.querySelector(`[data-element-type="${type}"]`)));
    const stack = [...(store.getState().document?.root ?? [])];
    let inserted: (typeof stack)[number] | undefined;
    while (stack.length) {
      const node = stack.pop();
      if (node?.id.startsWith('el-new-')) {
        inserted = node;
        break;
      }
      if (node) stack.push(...node.children);
    }
    expect(inserted).toBeTruthy();
    const expected = store.getState().registry.defaultsFor(type)?.props;
    expect(inserted?.props).toEqual(expected);
    expect(inserted?.type).toBe(type);
  });

  it.each([
    ['ArrowRight', 'Section'],
    ['ArrowDown', 'Text'],
    ['ArrowLeft', 'Container'],
    ['ArrowUp', 'Container'],
  ])('palette grid moves focus with %s', async (key, target) => {
    const user = userEvent.setup();
    renderEditor();
    await waitFor(() => {
      expect(screen.getByRole('tree')).toBeTruthy();
    });
    await openElements(user);
    const first = required(document.querySelector<HTMLElement>('[data-element-type="blixis/container"]'));
    first.focus();
    await user.keyboard(`{${key}}`);
    expect(required(document.activeElement).textContent.trim()).toBe(target);
  });

  it.each([
    ['blixis/section', 'Section'],
    ['blixis/container', 'Container'],
    ['blixis/heading', 'Heading'],
    ['blixis/text', 'Text'],
    ['blixis/image', 'Image'],
    ['blixis/button', 'Button'],
  ])('filters registered type %s by label text', async (type, label) => {
    const user = userEvent.setup();
    renderEditor();
    await waitFor(() => {
      expect(screen.getByRole('tree')).toBeTruthy();
    });
    await user.click(screen.getByRole('tab', { name: 'Elements' }));
    const activePanel = document.querySelector<HTMLElement>('[role="tabpanel"][data-state="active"]');
    if (!activePanel) throw new Error('active palette tab is missing');
    const search = within(activePanel).getByRole('textbox', { name: 'Search elements...' });
    await user.type(search, label);
    expect(activePanel.querySelector(`[data-element-type="${type}"]`)).toBeTruthy();
    expect(activePanel.querySelectorAll('.blx-element-card').length).toBeGreaterThan(0);
  });
});
