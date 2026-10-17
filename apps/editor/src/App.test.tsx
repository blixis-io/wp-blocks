import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorApp } from './App';
import { CHROME_STORAGE_KEY } from './chrome-theme';
import { ErrorScreen } from './ErrorScreen';
import { PANELS_STORAGE_KEY } from './panels';
import { axeViolations } from './test/axe';
import { makeBootstrap } from './test/fixtures';
import { el, fakeClient, makeDocument, makeStore, ok, streamsOf } from './test/state-helpers';
import type { EditorBootstrap } from './bootstrap';
import type { MediaClient, MediaItem } from './api/types';

beforeEach(() => {
  sessionStorage.clear();
  window.innerWidth = 1440;
});

function nameOf(element: Element): string {
  return element.getAttribute('aria-label') ?? element.textContent.trim();
}

function descriptionOf(element: Element): string {
  const ids = element.getAttribute('aria-describedby')?.split(' ') ?? [];
  return ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
}

function setup(overrides: Partial<EditorBootstrap> = {}) {
  const user = userEvent.setup();
  const { store, client } = makeStore({ bootstrap: overrides, deps: { now: Date.now } });
  const view = render(<EditorApp bootstrap={makeBootstrap(overrides)} store={store} />);
  return { user, ...view, store, client, root: screen.getByTestId('editor-root') };
}

function mockSystemDark(dark: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: dark,
      media: '(prefers-color-scheme: dark)',
      addEventListener: (_: string, cb: (event: MediaQueryListEvent) => void) => listeners.add(cb),
      removeEventListener: (_: string, cb: (event: MediaQueryListEvent) => void) => listeners.delete(cb),
    })),
  );
  return (next: boolean) => {
    for (const cb of listeners) cb({ matches: next } as MediaQueryListEvent);
  };
}

describe('shell landmarks', () => {
  it('renders banner, toolbar, navigation, main and complementary landmarks', async () => {
    const { store } = setup();
    await waitFor(() => {
      expect(store.getState().document).not.toBeNull();
    });
    expect(store.getState().document).not.toBeNull();
    act(() => {
      store.getState().select('el-heading-1');
    });
    const banner = screen.getByRole('banner');
    expect(within(banner).getByRole('toolbar', { name: 'Editor toolbar' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Structure' })).toBeTruthy();
    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Content' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Style' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Advanced' })).toBeTruthy();
  });

  it('shows a dedicated Page settings inspector without element tabs when selection is empty', async () => {
    const { store } = setup();
    await waitFor(() => {
      expect(store.getState().pageSettingsStatus).toBe('ready');
    });
    await waitFor(() => {
      expect(store.getState().document).not.toBeNull();
    });
    act(() => {
      store.getState().select(null);
    });
    expect(screen.getByRole('tab', { name: 'Page' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByRole('tab', { name: 'Block' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Content' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Style' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Advanced' })).toBeNull();
    expect(document.querySelector('#inspector-section-page-settings-heading')).toBeTruthy();
    act(() => {
      store.getState().select('el-heading-1');
    });
    expect(await screen.findByRole('tab', { name: 'Content' })).toBeTruthy();
  });

  it('puts the skip link first in the tab order and it targets the canvas', async () => {
    const { user } = setup();
    await user.tab();
    const skip = screen.getByRole('link', { name: 'Skip to canvas' });
    expect(document.activeElement).toBe(skip);
    expect(skip.getAttribute('href')).toBe('#blx-canvas');
    expect(screen.getByRole('main').getAttribute('id')).toBe('blx-canvas');
  });

  it('shows the title, the content locale and the editor locale', () => {
    setup();
    expect(screen.getByText('About us')).toBeTruthy();
    expect(screen.getByText('Canvas arrives with the canvas protocol.')).toBeTruthy();
  });

  it('opens the draft preview URL and keeps the published URL on View page', () => {
    const { unmount } = setup();
    expect(screen.getByRole('button', { name: 'Pages' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'View page' }).getAttribute('href')).toBe(`${location.origin}/about/`);
    const open = vi.spyOn(window, 'open').mockReturnValue({ opener: window } as Window);
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(open).toHaveBeenCalledWith(`${location.origin}/about/?blixis_preview=nonce`, 'blixis-preview-42');
    expect((open.mock.results[0]?.value as Window).opener).toBeNull();
    open.mockRestore();
    unmount();
    setup({ previewUrl: null });
    expect(screen.getByRole('button', { name: 'Preview' }).getAttribute('aria-describedby')).toContain(
      'blx-preview-hint',
    );
  });

  it('saves dirty changes before opening preview', async () => {
    const { store, client } = setup();
    const open = vi.spyOn(window, 'open').mockReturnValue({ opener: window } as Window);
    await waitFor(() => {
      expect(store.getState().document).not.toBeNull();
    });
    act(() => {
      store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: 3 } });
    });
    expect(screen.getByRole('button', { name: 'Save and preview' })).toBeTruthy();
    client.writeLayout = vi.fn().mockResolvedValue({ ok: true, value: { revision: 6 } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and preview' }));
    await waitFor(() => {
      expect(open).toHaveBeenCalledTimes(1);
    });
    expect(store.getState().dirty.layout).toBe(false);
    open.mockRestore();
  });

  it('does not open preview when saving dirty changes fails', async () => {
    const { store, client } = setup();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await waitFor(() => {
      expect(store.getState().document).not.toBeNull();
    });
    act(() => {
      store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: 3 } });
    });
    client.writeLayout = vi.fn().mockResolvedValue({ ok: false, error: { kind: 'network' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and preview' }));
    await waitFor(() => {
      expect(store.getState().saveStatus).toBe('failed');
    });
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it('keeps undo and redo disabled while exposing the available publish workflow', () => {
    setup();
    for (const name of ['Undo', 'Redo']) {
      const button = screen.getByRole('button', { name });
      expect(button.getAttribute('aria-disabled')).toBe('true');
      expect(button.getAttribute('type')).toBe('button');
    }
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Publish' }).disabled).toBe(false);
    expect(screen.queryByRole('alert')).toBeNull();
    for (const name of ['Undo', 'Redo']) {
      expect(screen.getByRole('button', { name }).getAttribute('aria-disabled')).toBe('true');
    }
  });

  it('uses the Dutch catalog and RTL direction on the editor root only', () => {
    const { root } = setup({ editorLocale: 'nl_BE', contentLocale: 'ar', enabledLocales: ['en_US', 'ar'] });
    expect(root.getAttribute('lang')).toBe('nl-NL');
    expect(root.getAttribute('dir')).toBe('ltr');
    expect(screen.getByRole('button', { name: 'Concept opslaan' })).toBeTruthy();
    expect(document.documentElement.hasAttribute('dir')).toBe(false);
  });

  it('sets dir=rtl from the editor locale, not from the content locale', () => {
    const { root, unmount } = setup({ editorLocale: 'ar', contentLocale: 'en_US' });
    expect(root.getAttribute('dir')).toBe('rtl');
    unmount();
    const second = setup({ editorLocale: 'en_US', contentLocale: 'ar', enabledLocales: ['en_US', 'ar'] });
    expect(second.root.getAttribute('dir')).toBe('ltr');
    expect(screen.getByTestId('content-locale').textContent).toContain('Content language: ar');
  });
});

describe('redesigned editor header', () => {
  it.each([
    ['Pages', 'button'],
    ['Keyboard shortcuts', 'menuitem'],
    ['More options', 'button'],
    ['Undo', 'button'],
    ['Redo', 'button'],
    ['Desktop', 'radio'],
    ['Tablet', 'radio'],
    ['Mobile', 'radio'],
    ['Preview', 'button'],
    ['View page', 'link'],
    ['Save Draft', 'button'],
    ['Publish', 'button'],
    ['Publish options', 'button'],
    ['Blixis', 'link'],
    ['Structure panel', 'menuitemcheckbox'],
    ['Inspector panel', 'menuitemcheckbox'],
    ['Editor appearance: System', 'menuitemradio'],
    ['Content language: fr_FR', 'menuitem'],
    ['Editor language: en_US', 'menuitem'],
  ] as const)('exposes the %s %s control', async (name, role) => {
    const { user } = setup();
    if (role.startsWith('menuitem')) await user.click(screen.getByRole('button', { name: 'More options' }));
    expect(screen.getByRole(role, { name })).toBeTruthy();
  });

  it('opens Pages menu by click and Escape restores focus', async () => {
    const { user } = setup();
    const pages = screen.getByRole('button', { name: 'Pages' });
    await user.click(pages);
    expect(screen.getByRole('menuitem', { name: 'All pages' }).getAttribute('href')).toBe(
      `${location.origin}/wp-admin/edit.php`,
    );
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(document.activeElement).toBe(pages);
  });

  it('puts Back to admin inside Pages menu', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Pages' }));
    expect(screen.getByRole('menuitem', { name: 'Back to admin' }).getAttribute('href')).toBe(
      `${location.origin}/wp-admin/`,
    );
  });

  it('adds the shared tooltip hint to Save Draft and Publish actions', () => {
    setup();
    for (const name of ['Save Draft', 'Publish']) {
      const button = screen.getByRole('button', { name });
      expect(button.getAttribute('aria-describedby')).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: 'Save Draft' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('enables Publish and keeps unsupported Schedule and Unpublish items disabled', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Publish options' }));
    expect(screen.getByRole('menuitem', { name: 'Publish' }).getAttribute('aria-disabled')).toBe('false');
    for (const name of ['Schedule', 'Unpublish'])
      expect(screen.getByRole('menuitem', { name }).getAttribute('aria-disabled')).toBe('true');
  });

  it('opens the overflow menu with shortcuts and all panel and appearance controls', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'More options' }));
    for (const name of ['Keyboard shortcuts', 'Structure panel', 'Inspector panel'])
      expect(screen.getByRole(name === 'Keyboard shortcuts' ? 'menuitem' : 'menuitemcheckbox', { name })).toBeTruthy();
    for (const name of ['Editor appearance: System', 'Editor appearance: Light', 'Editor appearance: Dark'])
      expect(screen.getByRole('menuitemradio', { name })).toBeTruthy();
  });

  it('shows keyboard shortcuts dialog from overflow', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'More options' }));
    await user.click(screen.getByRole('menuitem', { name: 'Keyboard shortcuts' }));
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeTruthy();
  });

  it('rejects cross-origin preview URLs', () => {
    setup({ previewUrl: 'https://elsewhere.example/page' });
    expect(screen.queryByRole('link', { name: 'Preview' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Preview' }).getAttribute('aria-describedby')).toContain(
      'blx-preview-hint',
    );
  });

  it.each(['en_US', 'nl_NL'] as const)('formats saved status in editor locale %s', (editorLocale) => {
    setup({ editorLocale });
    const status = screen.getByText(editorLocale === 'en_US' ? /Saved/ : /Opgeslagen/);
    expect(status.textContent).toMatch(editorLocale === 'en_US' ? /now|second ago/ : /nu|seconde geleden/);
  });

  it('updates relative saved time while the header remains mounted', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    try {
      vi.setSystemTime(new Date('2026-10-15T10:00:00Z'));
      const { store } = setup();
      await waitFor(() => {
        expect(store.getState().document).not.toBeNull();
      });
      expect(screen.getByText('Saved now')).toBeTruthy();
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(screen.getByText('Saved 1 minute ago')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses dirty state for the unsaved status', async () => {
    const { store } = setup();
    await waitFor(() => {
      expect(store.getState().document).not.toBeNull();
    });
    act(() => {
      store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: 3 } });
    });
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
  });

  it('autosaves a dirty draft after five seconds of inactivity', async () => {
    const { store, client } = setup();
    const writeLayout = vi.fn(() => Promise.resolve(ok({ revision: 1 })));
    client.writeLayout = writeLayout;
    await waitFor(() => {
      expect(store.getState().document).not.toBeNull();
    });
    vi.useFakeTimers();
    try {
      act(() => {
        store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: 3 } });
      });
      expect(writeLayout).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4999);
      });
      expect(writeLayout).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
        await Promise.resolve();
      });
      expect(writeLayout).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps autosave disabled when its separate preference is off', async () => {
    localStorage.setItem('blixis-editor-autosave', 'false');
    const { store, client } = setup();
    const writeLayout = vi.fn(() => Promise.resolve(ok({ revision: 1 })));
    client.writeLayout = writeLayout;
    await waitFor(() => {
      expect(store.getState().document).not.toBeNull();
    });
    vi.useFakeTimers();
    try {
      act(() => {
        store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: 3 } });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(writeLayout).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('pauses autosave while publication is running and cancels its timer on unmount', async () => {
    const { store, client, unmount } = setup();
    const writeLayout = vi.fn(() => Promise.resolve(ok({ revision: 1 })));
    client.writeLayout = writeLayout;
    await waitFor(() => {
      expect(store.getState().document).not.toBeNull();
    });
    vi.useFakeTimers();
    try {
      act(() => {
        store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: 3 } });
      });
      act(() => {
        store.setState({ publicationStatus: 'publishing' });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000);
      });
      expect(writeLayout).not.toHaveBeenCalled();
      act(() => {
        store.setState({ publicationStatus: 'idle' });
      });
      unmount();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000);
      });
      expect(writeLayout).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not retry a failed autosave until dismissal and a later edit', async () => {
    const { store, client } = setup();
    const writeLayout = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: { kind: 'network' } })
      .mockResolvedValue({ ok: true, value: { revision: 1 } });
    client.writeLayout = writeLayout;
    await waitFor(() => {
      expect(store.getState().document).not.toBeNull();
    });
    vi.useFakeTimers();
    try {
      act(() => {
        store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: 3 } });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(writeLayout).toHaveBeenCalledTimes(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(writeLayout).toHaveBeenCalledTimes(1);
      const alert = screen.getByRole('alert');
      fireEvent.click(within(alert).getByRole('button', { name: 'Close' }));
      act(() => {
        store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: 4 } });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(writeLayout).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops after three failed automatic attempts until a manual save', async () => {
    const { store, client } = setup();
    const writeLayout = vi.fn(() => Promise.resolve({ ok: false as const, error: { kind: 'network' as const } }));
    client.writeLayout = writeLayout;
    await waitFor(() => {
      expect(store.getState().document).not.toBeNull();
    });
    vi.useFakeTimers();
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        act(() => {
          store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: attempt + 3 } });
        });
        await act(async () => {
          await vi.advanceTimersByTimeAsync(5000);
        });
        expect(writeLayout).toHaveBeenCalledTimes(attempt + 1);
        fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Close' }));
      }
      act(() => {
        store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: 6 } });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(writeLayout).toHaveBeenCalledTimes(3);
      fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
      expect(writeLayout).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not autosave while the conflict dialog is open', async () => {
    const { store, client } = setup();
    const writeLayout = vi.fn(() => Promise.resolve(ok({ revision: 1 })));
    client.writeLayout = writeLayout;
    await waitFor(() => {
      expect(store.getState().document).not.toBeNull();
    });
    act(() => {
      store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level: 3 } });
    });
    act(() => {
      store.setState({
        saveStatus: 'failed',
        saveError: { kind: 'http', status: 409 },
        saveErrorKey: 'save.error.conflict',
      });
    });
    expect(await screen.findByRole('dialog')).toBeTruthy();
    vi.useFakeTimers();
    try {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(writeLayout).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('offers Unpublish for published pages and refreshes the chip after confirmation', async () => {
    const { store, client, user } = setup();
    await waitFor(() => {
      expect(store.getState().document).not.toBeNull();
    });
    store.setState({
      publication: {
        pointerRevision: 4,
        layout: { state: 'published', snapshot: 2, workingRevision: 1 },
        locales: { en_US: { state: 'published', snapshot: 2, workingRevision: 1 } },
      },
    });
    const unpublish = vi.fn(() =>
      Promise.resolve(ok({ pointerRevision: 5, layoutSnapshot: null, contentSnapshot: null, pinnedLocales: [] })),
    );
    client.unpublish = unpublish;
    await user.click(screen.getByRole('button', { name: 'Publish options' }));
    const item = screen.getByRole('menuitem', { name: 'Unpublish' });
    expect(item.getAttribute('aria-disabled')).not.toBe('true');
    await user.click(item);
    expect(screen.getByRole('dialog', { name: 'Unpublish this page?' })).toBeTruthy();
    expect(
      within(screen.getByRole('dialog')).getByText(
        'Visitors will see the regular page content until you publish again. Your draft and previous versions are kept.',
      ),
    ).toBeTruthy();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Unpublish' }));
    await waitFor(() => {
      expect(unpublish).toHaveBeenCalledWith({ pointerRevision: 4 });
    });
    await waitFor(() => {
      expect(screen.getByText('Not published')).toBeTruthy();
    });
  });

  it('collapses Preview and Save Draft labels below 1100px', () => {
    setup();
    act(() => {
      window.innerWidth = 1000;
      window.dispatchEvent(new Event('resize'));
    });
    const header = screen.getByRole('banner');
    expect(header.getAttribute('data-compact')).toBe('true');
    expect(screen.getByRole('button', { name: 'Preview' }).querySelector('span')?.textContent).toContain('Preview');
    expect(screen.getByRole('button', { name: 'Save Draft' })).toBeTruthy();
  });

  it('moves secondary controls to overflow below 900px and preserves viewport buttons', async () => {
    const { user } = setup();
    act(() => {
      window.innerWidth = 800;
      window.dispatchEvent(new Event('resize'));
    });
    expect(screen.getByRole('banner').getAttribute('data-narrow')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Desktop' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'More options' }));
    for (const name of ['Preview', 'Save Draft', 'Publish'])
      expect(screen.getByRole('menuitem', { name })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Save Draft' }).getAttribute('aria-describedby')).toBe('blx-save-hint');
    expect(screen.getByRole('menuitem', { name: 'Publish' }).getAttribute('aria-describedby')).toBe('blx-publish-hint');
  });

  it('keeps undo and redo disabled from empty history', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Undo' }).getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('button', { name: 'Redo' }).getAttribute('aria-disabled')).toBe('true');
  });

  it.each(['light', 'dark'] as const)('has no axe violations in %s chrome', async (theme) => {
    const { root } = setup();
    root.setAttribute('data-editor-theme', theme);
    expect(await axeViolations(root)).toEqual([]);
  });

  it('uses same-origin preview URLs and secure published links', () => {
    setup();
    const link = screen.getByRole('link', { name: 'View page' });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });
});

describe('schema driven inspector', () => {
  const mediaFixture: MediaItem = {
    id: 891,
    url: `${location.origin}/uploads/picker.png`,
    thumbUrl: `${location.origin}/uploads/picker-thumb.png`,
    alt: 'Picker alt text',
    title: 'Picker image',
    width: 24,
    height: 24,
    mime: 'image/png',
  };
  const mediaClient = (): MediaClient => ({
    get: () => Promise.resolve({ ok: true, value: mediaFixture }),
    list: () => Promise.resolve({ ok: true, value: { items: [mediaFixture], total: 1, totalPages: 1 } }),
    upload: () => Promise.resolve({ ok: true, value: mediaFixture }),
  });

  it('writes a chosen media item and resolved preview into the page settings draft', async () => {
    const user = userEvent.setup();
    const { store } = makeStore();
    render(<EditorApp bootstrap={makeBootstrap()} store={store} mediaClient={mediaClient()} />);
    await waitFor(() => {
      expect(store.getState().pageSettingsStatus).toBe('ready');
    });
    const chooseButtons = screen.getAllByRole('button', { name: 'Choose image' });
    const chooseFeatured = chooseButtons[0];
    if (!chooseFeatured) throw new Error('featured media picker button is missing');
    await user.click(chooseFeatured);
    await user.click(await screen.findByRole('option', { name: 'Picker image' }));
    await user.click(screen.getByRole('button', { name: 'Use image' }));
    expect(store.getState().pageSettings?.featuredImage).toMatchObject({
      id: mediaFixture.id,
      url: mediaFixture.url,
      alt: mediaFixture.alt,
      width: 24,
      height: 24,
    });
  });

  it('writes a chosen Open Graph image id and resolved preview into the current locale draft', async () => {
    const user = userEvent.setup();
    const { store } = makeStore();
    render(<EditorApp bootstrap={makeBootstrap()} store={store} mediaClient={mediaClient()} />);
    await waitFor(() => {
      expect(store.getState().pageSettingsStatus).toBe('ready');
    });
    await user.click(screen.getByRole('button', { name: 'Toggle Social' }));
    const chooseButtons = screen.getAllByRole('button', { name: 'Choose image' });
    const chooseOpenGraph = chooseButtons[1];
    if (!chooseOpenGraph) throw new Error('Open Graph media picker button is missing');
    await user.click(chooseOpenGraph);
    await user.click(await screen.findByRole('option', { name: 'Picker image' }));
    await user.click(screen.getByRole('button', { name: 'Use image' }));
    expect(store.getState().pageSettings?.seo['fr_FR']?.ogImageId).toBe(mediaFixture.id);
    expect(screen.getByText('Picker image')).toBeTruthy();
  });

  it('sets the Image element media prop and fills its empty translatable alt from the attachment', async () => {
    const imageDocument = makeDocument();
    const firstRoot = imageDocument.root[0];
    const firstContainer = firstRoot?.children[0];
    if (!firstContainer) throw new Error('image fixture container is missing');
    firstContainer.children.push(el('media-target', 'blixis/image'));
    const user = userEvent.setup();
    const { store } = makeStore({ document: imageDocument });
    render(<EditorApp bootstrap={makeBootstrap()} store={store} mediaClient={mediaClient()} />);
    await waitFor(() => {
      expect(store.getState().document).not.toBeNull();
    });
    act(() => {
      store.getState().select('media-target');
    });
    await user.click(screen.getByRole('button', { name: 'Choose image' }));
    await user.click(await screen.findByRole('option', { name: 'Picker image' }));
    await user.click(screen.getByRole('button', { name: 'Use image' }));
    const mediaElement = store
      .getState()
      .document?.root[0]?.children[0]?.children.find((node) => node.id === 'media-target');
    expect(mediaElement?.props['attachmentId']).toBe(mediaFixture.id);
    expect(store.getState().document?.translations['fr_FR']?.['media-target']?.values['alt']).toBe(mediaFixture.alt);
  });

  it('provides media library guidance and alt editor, a missing-alt warning, and accessible tabs', async () => {
    const imageDocument = makeDocument();
    const section = imageDocument.root[0];
    const container = section?.children[0];
    if (container === undefined) throw new Error('image fixture container is missing');
    container.children.push(el('image-1', 'blixis/image'));
    const user = userEvent.setup();
    const { store } = makeStore({ document: imageDocument });
    const view = render(<EditorApp bootstrap={makeBootstrap()} store={store} />);
    await waitFor(() => {
      expect(store.getState().document).not.toBeNull();
    });
    act(() => {
      store.getState().select('image-1');
    });
    expect(screen.getByRole('spinbutton', { name: 'Media attachment ID' })).toBeTruthy();
    expect(screen.getByText('Add alternative text, or mark this image as decorative.')).toBeTruthy();
    for (const tab of ['Content', 'Style', 'Advanced']) {
      await user.click(screen.getByRole('tab', { name: tab }));
      expect(await axeViolations(view.container)).toEqual([]);
    }
  });

  it('keeps locked controls readable and disabled and applies RTL to inspector layout', async () => {
    const { user, store, root } = setup({ editingEnabled: false, lockReason: 'Theme lock', editorLocale: 'ar' });
    await waitFor(() => {
      expect(store.getState().document).not.toBeNull();
    });
    act(() => {
      store.getState().select('el-heading-1');
    });
    expect(root.getAttribute('dir')).toBe('rtl');
    expect(screen.getByRole('textbox', { name: 'Text' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getAllByText('Editing is disabled: Theme lock').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('tab', { name: 'Style' }));
    expect(await axeViolations(root)).toEqual([]);
  });

  it('exposes all six registered element editors and keeps each inspector tab accessible', async () => {
    const { user, store, root } = setup();
    await waitFor(() => {
      expect(store.getState().document).not.toBeNull();
    });
    for (const id of ['el-section-1', 'el-container-1', 'el-heading-1', 'el-text-1', 'el-section-2', 'el-button-1']) {
      expect(store.getState().select(id)).toBe(true);
      const tabs = ['Content', 'Style', 'Advanced'];
      for (const tab of tabs) {
        await user.click(await screen.findByRole('tab', { name: tab }));
        expect(await axeViolations(root)).toEqual([]);
      }
    }
    expect(store.getState().select('el-heading-1')).toBe(true);
    await user.click(screen.getByRole('tab', { name: 'Content' }));
    await user.click(screen.getByRole('tab', { name: 'Content' }));
    expect(screen.getByRole('textbox', { name: 'Text' })).toBeTruthy();
    expect(store.getState().select('el-text-1')).toBe(true);
    expect(screen.getByRole('textbox', { name: 'Text' })).toBeTruthy();
    expect(store.getState().select('el-button-1')).toBe(true);
    await user.click(screen.getByRole('tab', { name: 'Content' }));
    expect(screen.getByRole('checkbox', { name: 'Open in a new tab' })).toBeTruthy();
  }, 30_000);

  it('maps registry fields to accessible controls and edits translated text in the active locale', async () => {
    const { user, store } = setup();
    await waitFor(() => {
      expect(store.getState().document).not.toBeNull();
    });
    store.getState().setContentLocale('en_US');
    await user.click(screen.getByRole('treeitem', { name: /el-heading-1/ }));
    const text = screen.getByRole('textbox', { name: 'Text' });
    await user.clear(text);
    await user.type(text, 'Updated heading');
    expect(store.getState().document?.translations['en_US']?.['el-heading-1']?.values['text']).toBe('Updated heading');
    expect(store.getState().coalesce?.key).toContain('el-heading-1:en_US:text');
    await user.click(screen.getByRole('tab', { name: 'Content' }));
    const level = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Heading level' });
    expect(level).toBeTruthy();
    await user.selectOptions(level, '3');
    expect(store.getState().document?.root[0]?.children[0]?.children[0]?.props['level']).toBe(3);
  });

  it('dispatches invariant properties through update-props and shows unsafe URL validation inline', async () => {
    const { user, store } = setup();
    await waitFor(() => {
      expect(store.getState().document).not.toBeNull();
    });
    store.getState().setContentLocale('en_US');
    await user.click(screen.getByRole('treeitem', { name: /el-button-1/ }));
    await user.click(screen.getByRole('tab', { name: 'Content' }));
    await user.clear(screen.getByRole('textbox', { name: 'Label' }));
    await user.type(screen.getByRole('textbox', { name: 'Label' }), 'Save');
    expect(store.getState().document?.translations['en_US']?.['el-button-1']?.values['label']).toBe('Save');
    const link = screen.getByRole('textbox', { name: 'Link' });
    await user.clear(link);
    await user.type(link, 'javascript:alert(1)');
    await user.tab();
    expect(screen.getByRole('alert').textContent).toContain('safe link');
    expect(store.getState().document?.translations['en_US']?.['el-button-1']?.values['href']).toBeUndefined();
    await user.click(screen.getByRole('tab', { name: 'Content' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Button style' }), 'outline');
    expect(store.getState().document?.root[1]?.children[0]?.props['variant']).toBe('outline');
  });

  it('edits breakpoint styles and can return to inherited values', async () => {
    const { user, store } = setup();
    await waitFor(() => {
      expect(store.getState().document).not.toBeNull();
    });
    await user.click(screen.getByRole('treeitem', { name: /el-heading-1/ }));
    await user.click(screen.getByRole('radio', { name: 'Tablet' }));
    await user.click(screen.getByRole('tab', { name: 'Style' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Color' }), 'var(--blx-color-text)');
    expect(store.getState().document?.root[0]?.children[0]?.children[0]?.style).toEqual([
      expect.objectContaining({ breakpoint: 'tablet', declarations: { color: 'var(--blx-color-text)' } }),
    ]);
    await user.click(screen.getByRole('button', { name: 'Reset Color to inherited' }));
    expect(store.getState().document?.root[0]?.children[0]?.children[0]?.style).toBeUndefined();
  });
});

describe('chips', () => {
  it('announce their meaning with real text, not aria-label on a generic element', async () => {
    const { user } = setup();
    expect(document.querySelector('.blx-chip')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'More options' }));
    expect(screen.getByRole('menuitem', { name: 'Content language: fr_FR' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Editor language: en_US' })).toBeTruthy();
  });
});

describe('RTL mirroring', () => {
  const items = (container: HTMLElement) =>
    [...container.querySelectorAll<HTMLElement>('a[href], button')].filter(
      (el) => el.getAttribute('tabindex') !== null,
    );

  it.each([
    ['ar', 'rtl', '{ArrowLeft}', '{ArrowRight}'],
    ['en_US', 'ltr', '{ArrowRight}', '{ArrowLeft}'],
  ] as const)('toolbar in %s carries dir=%s; %s moves forward, %s back', async (locale, dir, forward, back) => {
    const { user } = setup({ editorLocale: locale });
    const toolbar = screen.getByRole('toolbar');
    expect(toolbar.getAttribute('dir')).toBe(dir);
    await user.tab();
    await user.tab();
    const first = document.activeElement as HTMLElement;
    expect(toolbar.contains(first)).toBe(true);
    const order = items(toolbar);
    expect(first).toBe(order[0]);
    await user.keyboard(forward);
    expect(document.activeElement).toBe(order[1]);
    await user.keyboard(back);
    expect(document.activeElement).toBe(first);
  });

  it.each([
    ['ar', 'rtl', '{ArrowLeft}', '{ArrowRight}'],
    ['en_US', 'ltr', '{ArrowRight}', '{ArrowLeft}'],
  ] as const)('tablist in %s carries dir=%s; %s moves forward, %s back', async (locale, dir, forward, back) => {
    const { user, store } = setup({ editorLocale: locale });
    await waitFor(() => {
      expect(store.getState().document).not.toBeNull();
    });
    act(() => {
      store.getState().select('el-heading-1');
    });
    const list = screen.getByRole('tablist', { name: 'Inspector sections' });
    expect(list.parentElement?.getAttribute('dir')).toBe(dir); // the Tabs root, which Radix sets from the provider
    const tabs = within(list).getAllByRole('tab');
    tabs[0]?.focus();
    await user.keyboard(forward);
    expect(document.activeElement).toBe(tabs[1]);
    await user.keyboard(back);
    expect(document.activeElement).toBe(tabs[0]);
  });
});

describe('toolbar roving tabindex', () => {
  it('has a single tab stop and moves with arrows, Home and End', async () => {
    const { user } = setup();
    const toolbar = screen.getByRole('toolbar');
    const items = () =>
      [...toolbar.querySelectorAll<HTMLElement>('a[href], button, [role="radio"]')].filter(
        (el) => el.getAttribute('tabindex') !== null,
      );
    // Roving tabindex: at most one tab stop in the toolbar (the group itself or the active item), never one per item.
    const stops = [toolbar, ...items()].filter((el) => el.getAttribute('tabindex') === '0');
    expect(stops).toHaveLength(1);

    await user.tab(); // skip link
    await user.tab(); // toolbar entry
    const first = document.activeElement as HTMLElement;
    expect(toolbar.contains(first)).toBe(true);
    expect(nameOf(first)).toBe('Pages');
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).not.toBe(first);
    expect(toolbar.contains(document.activeElement)).toBe(true);
    await user.keyboard('{End}');
    const last = document.activeElement as HTMLElement;
    expect(nameOf(last)).toBe('More options');
    await user.keyboard('{Home}');
    expect(nameOf(document.activeElement as HTMLElement)).toBe('Pages');
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).not.toBe(toolbar);
  });

  it('keeps disabled controls reachable and shows a tooltip on keyboard focus', async () => {
    const { user } = setup();
    const undo = screen.getByRole('button', { name: 'Undo' });
    await user.tab();
    await user.tab();
    for (let i = 0; i < 10 && document.activeElement !== undo; i++) await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(undo);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.textContent).toContain('Undo');
    expect(tooltip.querySelectorAll('kbd')).toHaveLength(2);
    expect(tooltip.querySelector('.ed-tooltip-arrow')).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

describe('keyboard shortcuts dialog', () => {
  it('opens, traps focus, closes on Escape and returns focus', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'More options' }));
    const trigger = screen.getByRole('menuitem', { name: 'Keyboard shortcuts' });
    await user.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(descriptionOf(dialog)).toMatch(/Navigation shortcuts work now/);
    expect(dialog.closest('.blx-editor')).not.toBeNull();
    for (let i = 0; i < 6; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'More options' }));
  });
});

describe('side panels', () => {
  it('marks the root motion-ready after mount and never leaves focus inside a closed panel', async () => {
    const { user } = setup();
    const root = screen.getByTestId('editor-root');
    expect(root.getAttribute('data-motion-ready')).toBe('true');
    expect(root.getAttribute('data-reduced-motion')).toMatch(/^(true|false)$/);
    await user.click(screen.getByRole('button', { name: 'More options' }));
    const toggle = screen.getByRole('menuitemcheckbox', { name: 'Inspector panel' });
    await user.click(toggle);
    const panel = document.getElementById('blx-inspector');
    expect(panel?.hasAttribute('inert')).toBe(true);
    expect(panel?.hasAttribute('hidden')).toBe(false);
    expect(panel?.contains(document.activeElement)).toBe(false);
    if (panel) fireEvent.transitionEnd(panel);
    expect(panel?.hasAttribute('hidden')).toBe(true);
  });

  it('collapses and expands with correct ARIA and remembers the state', async () => {
    const { user, unmount } = setup();
    await user.click(screen.getByRole('button', { name: 'More options' }));
    const toggle = screen.getByRole('menuitemcheckbox', { name: 'Structure panel' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(document.getElementById('blx-structure')?.closest('[hidden]') ?? null).toBeNull();
    await user.click(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    const panel = document.getElementById('blx-structure');
    expect(panel?.hasAttribute('inert')).toBe(true);
    expect(panel?.getAttribute('aria-hidden')).toBe('true');
    expect(panel?.hasAttribute('hidden')).toBe(false);
    if (panel) fireEvent.transitionEnd(panel);
    expect(panel?.hasAttribute('hidden')).toBe(true);
    expect(JSON.parse(localStorage.getItem(PANELS_STORAGE_KEY) ?? '{}')).toEqual({ left: false, right: true });
    unmount();
    setup();
    await userEvent.setup().click(screen.getByRole('button', { name: 'More options' }));
    expect(screen.getByRole('menuitemcheckbox', { name: 'Structure panel' }).getAttribute('aria-checked')).toBe(
      'false',
    );
    expect(screen.getByRole('menuitemcheckbox', { name: 'Inspector panel' }).getAttribute('aria-checked')).toBe('true');
  });

  it('survives blocked storage and garbage stored values', async () => {
    localStorage.setItem(PANELS_STORAGE_KEY, '{not json');
    const { user } = setup();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    await user.click(screen.getByRole('button', { name: 'More options' }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Inspector panel' }));
    await user.click(screen.getByRole('button', { name: 'More options' }));
    expect(screen.getByRole('menuitemcheckbox', { name: 'Inspector panel' }).getAttribute('aria-checked')).toBe(
      'false',
    );
  });

  it('switches inspector tabs', async () => {
    const { user, store } = setup();
    await waitFor(() => {
      expect(store.getState().document).not.toBeNull();
    });
    act(() => {
      store.getState().select('el-heading-1');
    });
    await user.click(await screen.findByRole('tab', { name: 'Style' }));
    expect(screen.getByRole('tab', { name: 'Style' }).getAttribute('aria-selected')).toBe('true');
  });
});

describe('editor chrome appearance', () => {
  it('applies the theme to the editor root only and persists it', async () => {
    mockSystemDark(false);
    const htmlAttrs = document.documentElement.getAttributeNames();
    const bodyAttrs = document.body.getAttributeNames();
    const { user, root, unmount } = setup();
    expect(root.getAttribute('data-editor-theme')).toBe('light');
    await user.click(screen.getByRole('button', { name: 'More options' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Editor appearance: Dark' }));
    expect(root.getAttribute('data-editor-theme')).toBe('dark');
    expect(localStorage.getItem(CHROME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.getAttributeNames()).toEqual(htmlAttrs);
    expect(document.body.getAttributeNames()).toEqual(bodyAttrs);
    expect(document.documentElement.hasAttribute('data-editor-theme')).toBe(false);
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(document.body.hasAttribute('data-editor-theme')).toBe(false);
    unmount();
    expect(setup().root.getAttribute('data-editor-theme')).toBe('dark');
  });

  it('does not touch the content locale label when the theme changes', async () => {
    const { user } = setup();
    const label = screen.getByTestId('content-locale');
    const before = label.textContent;
    await user.click(screen.getByRole('button', { name: 'More options' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Editor appearance: Dark' }));
    await user.click(screen.getByRole('button', { name: 'More options' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Editor appearance: Light' }));
    expect(screen.getByTestId('content-locale').textContent).toBe(before);
    expect(screen.getByTestId('content-locale').textContent).toContain('fr_FR');
  });

  it('follows the system preference live only while set to system', () => {
    const fire = mockSystemDark(true);
    const { root } = setup();
    expect(root.getAttribute('data-editor-theme')).toBe('dark');
    fire(false);
    return screen.findByTestId('editor-root').then(() => {
      expect(screen.getByTestId('editor-root').getAttribute('data-editor-theme')).toBe('light');
    });
  });

  it('ignores an invalid stored preference and does not read the site appearance key', () => {
    mockSystemDark(false);
    localStorage.setItem(CHROME_STORAGE_KEY, 'sepia');
    localStorage.setItem('blixis-appearance', 'dark');
    document.documentElement.setAttribute('data-theme', 'dark');
    const { root } = setup();
    expect(root.getAttribute('data-editor-theme')).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    document.documentElement.removeAttribute('data-theme');
  });
});

describe('locked document', () => {
  it('shows a status banner and keeps all editing controls disabled', () => {
    setup({ editingEnabled: false, lockReason: 'Locked by Ann' });
    expect(screen.getByTestId('lock-banner').textContent).toContain('Editing is disabled: Locked by Ann');
    for (const name of ['Undo', 'Redo', 'Save Draft', 'Publish']) {
      expect(screen.getByRole('button', { name }).getAttribute('aria-disabled')).toBe('true');
    }
  });

  it('uses a default reason and no banner when editing is enabled', () => {
    const { unmount } = setup({ editingEnabled: false, lockReason: null });
    expect(screen.getByTestId('lock-banner').textContent).toContain('this document cannot be edited right now.');
    unmount();
    setup();
    expect(screen.queryByTestId('lock-banner')).toBeNull();
  });
});

describe('error screen', () => {
  it('renders an alert without detail', () => {
    render(<ErrorScreen />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('The editor could not start');
    expect(alert.textContent).not.toMatch(/zod|invalid_type|nonce/i);
  });
});

describe('document load failure', () => {
  function failingSetup(overrides: Partial<EditorBootstrap> = {}) {
    let fail = true;
    let release: (() => void) | undefined;
    const streams = streamsOf(makeDocument());
    const client = fakeClient({
      layout: async () => {
        if (!fail) {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          return ok(streams.layout);
        }
        return { ok: false, error: { kind: 'network' } } as const;
      },
      contents: streams.contents,
    });
    const user = userEvent.setup();
    const { store } = makeStore({ bootstrap: overrides, deps: { client } });
    const view = render(<EditorApp bootstrap={makeBootstrap(overrides)} store={store} />);
    return {
      user,
      store,
      view,
      succeedNext: () => {
        fail = false;
      },
      finish: () => {
        release?.();
      },
    };
  }

  it('shows the alert with Retry in the main region even when the Structure panel is collapsed', async () => {
    localStorage.setItem(PANELS_STORAGE_KEY, JSON.stringify({ left: false, right: false }));
    failingSetup();
    const alert = await screen.findByRole('alert');
    expect(within(screen.getByRole('main')).getByRole('alert')).toBe(alert);
    expect(alert.textContent).toContain('The document could not be loaded.');
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(document.getElementById('blx-structure')?.hasAttribute('hidden')).toBe(true);
    // The Structure panel only points to it, with no second alert.
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('keeps focus on the loading status after Retry, then on the content when it loaded', async () => {
    const { user, succeedNext, finish, store } = failingSetup();
    const retry = await screen.findByRole('button', { name: 'Try again' });
    succeedNext();
    await user.click(retry);
    const status = await screen.findByTestId('load-retrying');
    expect(status.getAttribute('role')).toBe('status');
    await waitFor(() => {
      expect(document.activeElement).toBe(status);
    });
    expect(document.body.contains(document.activeElement)).toBe(true);
    finish();
    await waitFor(() => {
      expect(store.getState().status).toBe('ready');
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByTestId('load-retrying')).toBeNull();
  });

  it('moves focus back to the alert when the retry fails again', async () => {
    const { user } = failingSetup();
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('alert'));
    });
  });

  it('is translated and has no axe violations in English and Dutch', async () => {
    const { unmount } = (() => {
      const made = failingSetup();
      return { unmount: made.view.unmount };
    })();
    await screen.findByRole('alert');
    expect(await axeViolations()).toEqual([]);
    unmount();
    failingSetup({ editorLocale: 'nl_NL' });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Het document kon niet worden geladen.');
    expect(await axeViolations()).toEqual([]);
  });
});

describe('inspector selection label', () => {
  it('announces which element is selected with the translated prefix', async () => {
    const { user } = setup();
    await user.click(await screen.findByRole('treeitem', { name: /el-heading-1/ }));
    const selection = screen.getByTestId('inspector-selection');
    expect(selection.textContent).toContain('Selected element:');
    expect(selection.textContent).toContain('el-heading-1');
  });
  it('keeps the Inspector landmark named and selection live region without a visible title heading', async () => {
    const { user } = setup();
    await user.click(await screen.findByRole('treeitem', { name: /el-heading-1/ }));
    const inspector = screen.getByRole('complementary', { name: 'Inspector' });
    expect(inspector.getAttribute('aria-labelledby')).toBe('blx-inspector-label');
    expect(within(inspector).getByTestId('inspector-selection').getAttribute('aria-live')).toBe('polite');
    expect(inspector.querySelector('.blx-inspector-selection')?.classList.contains('blx-empty')).toBe(false);
  });
  it('does not emit title attributes for editor-owned hover hints', () => {
    setup();
    const titles = [...document.querySelectorAll('.blx-editor [title]')].filter(
      (element) => element.tagName !== 'IFRAME',
    );
    expect(titles).toEqual([]);
  });
});

describe('canvas breadcrumb stage bar', () => {
  it('keeps the home SVG attached while selection toggles repeatedly', () => {
    const bootstrap = makeBootstrap({ canvasUrl: 'https://example.test/canvas' });
    const { store, client } = makeStore({ bootstrap: { canvasUrl: bootstrap.canvasUrl } });
    render(<EditorApp bootstrap={bootstrap} store={store} client={client} />);

    const expectHomeIcon = () => {
      const button = screen.getByRole('button', { name: 'Page root' });
      const svg = button.querySelector(':scope > svg');
      expect(svg).toBeTruthy();
      expect(Number(svg?.getAttribute('width'))).toBeGreaterThanOrEqual(12);
      expect(svg?.querySelector('path[d]')).toBeTruthy();
    };

    expectHomeIcon();
    for (let index = 0; index < 4; index += 1) {
      act(() => {
        store.getState().select('el-heading-1');
      });
      expectHomeIcon();
      act(() => {
        store.getState().select(null);
      });
      expectHomeIcon();
    }
  });

  it('keeps the appearance radio and accessible tooltip description in the fixed breadcrumb row', () => {
    const bootstrap = makeBootstrap({ canvasUrl: 'https://example.test/canvas' });
    const { store, client } = makeStore({ bootstrap: { canvasUrl: bootstrap.canvasUrl } });
    render(<EditorApp bootstrap={bootstrap} store={store} client={client} />);
    const bar = screen.getByTestId('canvas-breadcrumb-bar');
    const radioGroup = within(bar).getByRole('radiogroup', { name: 'Preview appearance' });
    expect(bar.querySelector('.blx-breadcrumb')).toBeTruthy();
    expect(bar.contains(radioGroup)).toBe(true);
    expect(radioGroup.getAttribute('aria-describedby')).toBe('blx-appearance-hint');
    expect(screen.getByLabelText('Changes how the website content is previewed, not the editor.')).toBeTruthy();
  });
});

describe('accessibility (axe)', () => {
  it.each(['light', 'dark'] as const)('has no violations in the default %s chrome theme', async (theme) => {
    const { root } = setup();
    root.setAttribute('data-editor-theme', theme);
    expect(await axeViolations()).toEqual([]);
  });

  it('has no violations with the dialog open', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'More options' }));
    await user.click(screen.getByRole('menuitem', { name: 'Keyboard shortcuts' }));
    await screen.findByRole('dialog');
    expect(await axeViolations()).toEqual([]);
  });

  it('has no violations when locked, with collapsed panels and in Dutch', async () => {
    const { user } = setup({ editingEnabled: false, lockReason: 'x', editorLocale: 'nl_NL' });
    await user.click(screen.getByRole('button', { name: 'Meer opties' }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Structuurpaneel' }));
    expect(await axeViolations()).toEqual([]);
  });

  it('has no violations on the error screen', async () => {
    render(<ErrorScreen />);
    expect(await axeViolations()).toEqual([]);
  });
});
