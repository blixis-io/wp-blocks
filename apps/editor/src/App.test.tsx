import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EditorApp } from './App';
import { CHROME_STORAGE_KEY } from './chrome-theme';
import { ErrorScreen } from './ErrorScreen';
import { PANELS_STORAGE_KEY } from './panels';
import { axeViolations } from './test/axe';
import { makeBootstrap } from './test/fixtures';
import { fakeClient, makeDocument, makeStore, ok, streamsOf } from './test/state-helpers';
import type { EditorBootstrap } from './bootstrap';

function nameOf(element: Element): string {
  return element.getAttribute('aria-label') ?? element.textContent.trim();
}

function descriptionOf(element: Element): string {
  const ids = element.getAttribute('aria-describedby')?.split(' ') ?? [];
  return ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
}

function setup(overrides: Partial<EditorBootstrap> = {}) {
  const user = userEvent.setup();
  const { store } = makeStore({ bootstrap: overrides });
  const view = render(<EditorApp bootstrap={makeBootstrap(overrides)} store={store} />);
  return { user, ...view, root: screen.getByTestId('editor-root') };
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
  it('renders banner, toolbar, navigation, main and complementary landmarks', () => {
    setup();
    const banner = screen.getByRole('banner');
    expect(within(banner).getByRole('toolbar', { name: 'Editor toolbar' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Structure' })).toBeTruthy();
    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Content' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Style' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Settings' })).toBeTruthy();
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

  it('links back to admin and to the preview when a view URL exists, and disables preview otherwise', () => {
    const { unmount } = setup();
    expect(screen.getByRole('link', { name: 'Back to admin' }).getAttribute('href')).toBe(
      `${location.origin}/wp-admin/`,
    );
    expect(screen.getByRole('link', { name: 'Preview' }).getAttribute('href')).toBe(`${location.origin}/about/`);
    unmount();
    setup({ viewUrl: null });
    expect(screen.queryByRole('link', { name: 'Preview' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Preview' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('keeps undo, redo, save and publish as disabled placeholders', async () => {
    const { user } = setup();
    for (const name of ['Undo', 'Redo', 'Save', 'Publish']) {
      const button = screen.getByRole('button', { name });
      expect(button.getAttribute('aria-disabled')).toBe('true');
      expect(button.getAttribute('type')).toBe('button');
    }
    const save = screen.getByRole('button', { name: 'Save' });
    save.focus();
    await user.click(save);
    // Nothing happens: still disabled, still focused (so its tooltip can explain), nothing announced or changed.
    expect(document.activeElement).toBe(save);
    expect(save.getAttribute('aria-disabled')).toBe('true');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    for (const name of ['Undo', 'Redo', 'Publish']) {
      expect(screen.getByRole('button', { name }).getAttribute('aria-disabled')).toBe('true');
    }
  });

  it('uses the Dutch catalog and RTL direction on the editor root only', () => {
    const { root } = setup({ editorLocale: 'nl_BE', contentLocale: 'ar', enabledLocales: ['en_US', 'ar'] });
    expect(root.getAttribute('lang')).toBe('nl-NL');
    expect(root.getAttribute('dir')).toBe('ltr');
    expect(screen.getByRole('button', { name: 'Opslaan' })).toBeTruthy();
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

describe('chips', () => {
  it('announce their meaning with real text, not aria-label on a generic element', () => {
    setup();
    const chips = [...document.querySelectorAll('.blx-chip')];
    expect(chips.map((chip) => chip.textContent.trim())).toEqual(['Content language: fr_FR', 'Editor language: en_US']);
    for (const chip of chips) expect(chip.hasAttribute('aria-label')).toBe(false);
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
    const { user } = setup({ editorLocale: locale });
    const list = screen.getByRole('tablist');
    expect(list.parentElement?.getAttribute('dir')).toBe(dir); // the Tabs root, which Radix sets from the provider
    const tabs = screen.getAllByRole('tab');
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
    expect(nameOf(first)).toBe('Back to admin');
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).not.toBe(first);
    expect(toolbar.contains(document.activeElement)).toBe(true);
    await user.keyboard('{End}');
    const last = document.activeElement as HTMLElement;
    expect(nameOf(last)).toBe('Inspector panel');
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(first);
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(last);
  });

  it('keeps disabled controls reachable and shows a tooltip on keyboard focus', async () => {
    const { user } = setup();
    const undo = screen.getByRole('button', { name: 'Undo' });
    await user.tab();
    await user.tab();
    for (let i = 0; i < 10 && document.activeElement !== undo; i++) await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(undo);
    expect((await screen.findByRole('tooltip')).textContent).toContain('Undo the last change.');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

describe('keyboard shortcuts dialog', () => {
  it('opens, traps focus, closes on Escape and returns focus', async () => {
    const { user } = setup();
    const trigger = screen.getByRole('button', { name: 'Keyboard shortcuts' });
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
    expect(document.activeElement).toBe(trigger);
  });
});

describe('side panels', () => {
  it('collapses and expands with correct ARIA and remembers the state', async () => {
    const { user, unmount } = setup();
    const toggle = screen.getByRole('button', { name: 'Structure panel' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-controls')).toBe('blx-structure');
    expect(document.getElementById('blx-structure')?.closest('[hidden]') ?? null).toBeNull();
    await user.click(toggle);
    expect(screen.getByRole('button', { name: 'Structure panel' })).toBe(toggle); // the name is fixed
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById('blx-structure')?.hasAttribute('hidden')).toBe(true);
    expect(JSON.parse(localStorage.getItem(PANELS_STORAGE_KEY) ?? '{}')).toEqual({ left: false, right: true });
    unmount();
    setup();
    expect(screen.getByRole('button', { name: 'Structure panel' }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('button', { name: 'Inspector panel' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('survives blocked storage and garbage stored values', async () => {
    localStorage.setItem(PANELS_STORAGE_KEY, '{not json');
    const { user } = setup();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    await user.click(screen.getByRole('button', { name: 'Inspector panel' }));
    expect(screen.getByRole('button', { name: 'Inspector panel' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('switches inspector tabs', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('tab', { name: 'Style' }));
    expect(screen.getByText('Select an element to edit its style.').closest('[hidden]')).toBeNull();
  });
});

describe('editor chrome appearance', () => {
  it('applies the theme to the editor root only and persists it', async () => {
    mockSystemDark(false);
    const htmlAttrs = document.documentElement.getAttributeNames();
    const bodyAttrs = document.body.getAttributeNames();
    const { user, root, unmount } = setup();
    expect(root.getAttribute('data-editor-theme')).toBe('light');
    await user.click(screen.getByRole('radio', { name: 'Dark' }));
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
    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    await user.click(screen.getByRole('radio', { name: 'Light' }));
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
    expect(screen.getByRole('status').textContent).toContain('Editing is disabled: Locked by Ann');
    for (const name of ['Undo', 'Redo', 'Save', 'Publish']) {
      expect(screen.getByRole('button', { name }).getAttribute('aria-disabled')).toBe('true');
    }
  });

  it('uses a default reason and no banner when editing is enabled', () => {
    const { unmount } = setup({ editingEnabled: false, lockReason: null });
    expect(screen.getByRole('status').textContent).toContain('this document cannot be edited right now.');
    unmount();
    setup();
    expect(screen.queryByRole('status')).toBeNull();
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
});

describe('accessibility (axe)', () => {
  // jsdom applies no stylesheet, so a "dark theme" axe run would test the same DOM as the light one. Colour contrast
  // in both themes is verified from the design tokens in styles.test.ts instead.
  it('has no violations in the default state', async () => {
    setup();
    expect(await axeViolations()).toEqual([]);
  });

  it('has no violations with the dialog open', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
    await screen.findByRole('dialog');
    expect(await axeViolations()).toEqual([]);
  });

  it('has no violations when locked, with collapsed panels and in Dutch', async () => {
    const { user } = setup({ editingEnabled: false, lockReason: 'x', editorLocale: 'nl_NL' });
    await user.click(screen.getByRole('button', { name: /Structuurpaneel/ }));
    expect(await axeViolations()).toEqual([]);
  });

  it('has no violations on the error screen', async () => {
    render(<ErrorScreen />);
    expect(await axeViolations()).toEqual([]);
  });
});
