/* eslint-disable @typescript-eslint/no-confusing-void-expression, @typescript-eslint/no-empty-function, @typescript-eslint/no-floating-promises, @typescript-eslint/no-non-null-assertion, @typescript-eslint/unbound-method, @typescript-eslint/no-unnecessary-type-assertion */
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorApp } from './App';
import { makeBootstrap } from './test/fixtures';
import { makeStore, streamsOf } from './test/state-helpers';
import { axeViolations } from './test/axe';

const hostile = '<img src=x onerror=alert(1)>Server says no';
async function setup(options: { locale?: string; reason?: string | null } = {}) {
  const bootstrap = makeBootstrap({ editorLocale: options.locale ?? 'en_US', lockReason: options.reason ?? null });
  const made = makeStore({
    bootstrap: { editorLocale: options.locale ?? 'en_US', lockReason: options.reason ?? null },
  });
  const view = render(<EditorApp bootstrap={bootstrap} store={made.store} />);
  await waitFor(() => {
    if (!made.store.getState().document) throw new Error('waiting for document load');
  });
  return { ...made, ...view, user: userEvent.setup(), bootstrap };
}
function dirty(store: ReturnType<typeof makeStore>['store'], level = 3) {
  act(() => {
    const result = store.getState().dispatch({ type: 'update-props', id: 'el-heading-1', set: { level } });
    if (!result.ok) throw new Error(JSON.stringify(result));
  });
}
function failWrite(client: ReturnType<typeof makeStore>['client'], status: number, data: Record<string, unknown> = {}) {
  client.writeLayout = vi.fn(
    () =>
      Promise.resolve({ ok: false, error: { kind: 'http', status, data, code: 'hostile', message: hostile } }) as never,
  );
}
async function save(store: ReturnType<typeof makeStore>['store']) {
  await act(async () => {
    await store.getState().saveDraft();
  });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Save Draft UI recovery', () => {
  it.each([
    [401, 'Your session expired or you do not have permission. Sign in again, then retry.'],
    [403, 'Your session expired or you do not have permission. Sign in again, then retry.'],
    [413, 'This document is too large to save.'],
    [422, 'The server rejected this document as invalid. Review your changes and try again.'],
    [429, 'Too many saves. Retry in a moment.'],
    [500, 'The draft could not be saved. Try again.'],
    [503, 'The draft could not be saved. Try again.'],
  ])('announces HTTP %i with translated alert and no server text', async (status, message) => {
    const { store, client } = await setup();
    dirty(store);
    failWrite(client, status, { message: hostile });
    await save(store);
    expect(store.getState().saveErrorKey).toBeTruthy();
    expect(
      screen
        .getAllByRole('alert')
        .map((alert) => alert.textContent)
        .join(' '),
    ).toContain(message);
    if (status === 429) expect(screen.getAllByText('Retrying in 5 seconds.').length).toBeGreaterThan(0);
    expect(document.body.innerHTML).not.toContain(hostile);
    expect(screen.queryByText(/Server says no/)).toBeNull();
  });

  it.each([
    [
      401,
      'Your session expired or you do not have permission. Sign in again, then retry.',
      'Je sessie is verlopen of je hebt geen toestemming. Meld je opnieuw aan en probeer het opnieuw.',
    ],
    [
      403,
      'Your session expired or you do not have permission. Sign in again, then retry.',
      'Je sessie is verlopen of je hebt geen toestemming. Meld je opnieuw aan en probeer het opnieuw.',
    ],
    [413, 'This document is too large to save.', 'Dit document is te groot om op te slaan.'],
    [
      422,
      'The server rejected this document as invalid. Review your changes and try again.',
      'De server heeft dit document als ongeldig afgewezen. Controleer je wijzigingen en probeer het opnieuw.',
    ],
    [429, 'Too many saves. Retry in a moment.', 'Te veel opslagverzoeken. Probeer het zo opnieuw.'],
    [500, 'The draft could not be saved. Try again.', 'Het concept kon niet worden opgeslagen. Probeer het opnieuw.'],
    [503, 'The draft could not be saved. Try again.', 'Het concept kon niet worden opgeslagen. Probeer het opnieuw.'],
  ] as const)('localizes HTTP %i recovery copy in English and Dutch', async (status, en, nl) => {
    for (const [locale, expected] of [
      ['en_US', en],
      ['nl_NL', nl],
    ] as const) {
      const { store, client } = await setup({ locale });
      dirty(store);
      failWrite(client, status);
      await save(store);
      expect(
        screen
          .getAllByRole('alert')
          .map((alert) => alert.textContent)
          .join(' '),
      ).toContain(expected);
      cleanup();
    }
  });

  it('enables Save Draft only when dirty, then marks it busy during the write', async () => {
    const { store, client } = await setup();
    const button = screen.getByRole('button', { name: 'Save Draft' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    dirty(store);
    expect(button.getAttribute('aria-disabled')).not.toBe('true');
    let finish!: (value: never) => void;
    client.writeLayout = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve as never;
        }) as never,
    );
    let pending!: Promise<void>;
    act(() => {
      pending = store.getState().saveDraft();
    });
    expect(button.getAttribute('aria-busy')).toBe('true');
    await act(async () => {
      finish({ ok: true, value: { revision: 6 } } as never);
      await pending;
    });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.getAttribute('aria-busy')).toBe('false');
  });

  it.each([401, 403])('provides a safe sign-in link for %i', async (status) => {
    const { store, client } = await setup();
    dirty(store);
    failWrite(client, status);
    await save(store);
    const link = screen.getAllByRole('link', { name: 'Sign in again' })[0]!;
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('shows a 423 lock reason and disables Save Draft while retaining edits', async () => {
    const { store, client } = await setup({ reason: 'Theme update required' });
    dirty(store);
    failWrite(client, 423, { reason: 'Theme update required' });
    await save(store);
    expect(
      screen
        .getAllByRole('alert')
        .map((alert) => alert.textContent)
        .join(' '),
    ).toContain('This document is locked');
    expect(screen.getByText('Theme update required')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save Draft' }).getAttribute('aria-disabled')).toBe('true');
    expect(store.getState().dirty.layout).toBe(true);
  });

  it('announces network failures and allows manual retry', async () => {
    const { store, client, user } = await setup();
    dirty(store);
    client.writeLayout = vi.fn().mockResolvedValue({ ok: false, error: { kind: 'network', message: hostile } });
    await save(store);
    expect(
      screen
        .getAllByRole('alert')
        .map((alert) => alert.textContent)
        .join(' '),
    ).toContain('You appear to be offline');
    expect(document.body.innerHTML).not.toContain(hostile);
    expect(screen.getAllByRole('button', { name: 'Retry save' }).length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole('button', { name: 'Retry save' })[0]!);
  });

  it('shows success as a status and exposes a busy state during a write', async () => {
    const { store, client } = await setup();
    dirty(store);
    let finish!: (value: never) => void;
    client.writeLayout = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve as never;
        }) as never,
    );
    let pending!: Promise<void>;
    act(() => {
      pending = store.getState().saveDraft();
    });
    expect(screen.getByRole('button', { name: 'Save Draft' }).getAttribute('aria-busy')).toBe('true');
    await act(async () => {
      finish({ ok: true, value: { revision: 6 } } as never);
      await pending;
    });
    expect(screen.getByRole('status').textContent).toMatch(/Saved/);
  });

  it('dismisses a failure alert', async () => {
    const { store, client, user } = await setup();
    dirty(store);
    failWrite(client, 500);
    await save(store);
    await user.click(screen.getAllByRole('button', { name: 'Close' }).at(-1)!);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('opens a conflict dialog, traps focus, Escape keeps dirty edits, and Keep editing closes it', async () => {
    const { store, client, user } = await setup();
    dirty(store);
    failWrite(client, 409);
    await save(store);
    const dialog = screen.getByRole('dialog', { name: 'This draft changed elsewhere' });
    expect(document.activeElement).toBe(dialog.querySelector('button'));
    const buttons = [...dialog.querySelectorAll('button')];
    buttons.at(-1)?.focus();
    await user.keyboard('{Tab}');
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(store.getState().dirty.layout).toBe(true);
    // A second conflict presents Keep editing explicitly and preserves dirty state.
    await save(store);
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(store.getState().dirty.layout).toBe(true);
  });

  it('confirms reload latest before replacing local changes with the server document', async () => {
    const { store, client, user, document } = await setup();
    dirty(store);
    failWrite(client, 409);
    await save(store);
    await user.click(screen.getByRole('button', { name: 'Reload latest' }));
    expect(screen.getByRole('dialog', { name: 'Discard your local edits?' })).toBeTruthy();
    const latest = structuredClone(document);
    latest.root[0]!.props = { server: true };
    const latestStreams = streamsOf(latest, 11, 9);
    client.readLayout = vi.fn().mockResolvedValue({ ok: true, value: latestStreams.layout });
    client.readContent = vi.fn((locale: string) =>
      Promise.resolve({ ok: true as const, value: latestStreams.contents[locale]! }),
    );
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(store.getState().dirty.layout).toBe(false));
    expect(store.getState().revisions.layout).toBe(11);
    expect(store.getState().document?.root[0]?.props).toMatchObject({ server: true });
  });

  it.each(['Reload latest', 'Overwrite with my changes'])(
    'returns from the %s confirm step without applying it',
    async (action) => {
      const { store, client, user } = await setup();
      dirty(store);
      failWrite(client, 409);
      await save(store);
      const reads = vi.spyOn(client, 'readLayout');
      await user.click(screen.getByRole('button', { name: action }));
      expect(screen.getByRole('button', { name: 'Confirm' })).toBeTruthy();
      await user.click(screen.getByRole('button', { name: 'Go back' }));
      expect(screen.getByRole('dialog', { name: 'This draft changed elsewhere' })).toBeTruthy();
      expect(store.getState().dirty.layout).toBe(true);
      expect(reads).not.toHaveBeenCalled();
    },
  );

  it('confirms overwrite, re-reads stream revisions and retries once with fresh If-Match', async () => {
    const { store, client, user } = await setup();
    dirty(store);
    const calls: number[] = [];
    client.writeLayout = vi.fn((_doc: unknown, revision: number) => {
      calls.push(revision);
      return Promise.resolve({ ok: false, error: { kind: 'http', status: 409 } }) as never;
    });
    await save(store);
    await user.click(screen.getByRole('button', { name: 'Overwrite with my changes' }));
    expect(screen.getByRole('dialog', { name: 'Replace the newer saved version?' }).textContent).toContain(
      'replace the latest saved version',
    );
    client.readLayout = vi.fn().mockResolvedValue({ ok: true, value: { revision: 10, locale: null, document: null } });
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(calls).toEqual([5, 10]));
    expect(client.writeLayout).toHaveBeenCalledTimes(2);
    // The overwrite retry receives a second conflict and reopens recovery without looping.
    expect(screen.getByRole('dialog', { name: 'This draft changed elsewhere' })).toBeTruthy();
  });

  it.each(['en_US', 'nl_NL'] as const)(
    '%s header reports unsaved, saving, saved time and failure states',
    async (locale) => {
      const { store, client, user } = await setup({ locale });
      const copy =
        locale === 'en_US'
          ? {
              unsaved: 'Unsaved changes',
              saving: 'Saving…',
              saved: /Saved/,
              failed: 'Save failed',
              retry: 'Retry save',
            }
          : {
              unsaved: 'Niet-opgeslagen wijzigingen',
              saving: 'Opslaan…',
              saved: /Opgeslagen/,
              failed: 'Opslaan mislukt',
              retry: 'Opnieuw opslaan',
            };
      dirty(store);
      expect(screen.getByText(copy.unsaved)).toBeTruthy();
      let finish!: (value: never) => void;
      client.writeLayout = vi.fn(
        () =>
          new Promise((resolve) => {
            finish = resolve as never;
          }) as never,
      );
      let pending!: Promise<void>;
      act(() => {
        pending = store.getState().saveDraft();
      });
      expect(screen.getAllByText(copy.saving).length).toBeGreaterThan(0);
      await act(async () => {
        finish({ ok: true, value: { revision: 7 } } as never);
        await pending;
      });
      expect(screen.getByText(copy.saved)).toBeTruthy();
      dirty(store, 4);
      client.writeLayout = vi.fn().mockResolvedValue({ ok: false, error: { kind: 'http', status: 500 } });
      await save(store);
      expect(screen.getByText(copy.failed)).toBeTruthy();
      expect(screen.getAllByRole('button', { name: copy.retry }).length).toBeGreaterThan(0);
      await user.click(screen.getAllByRole('button', { name: copy.retry })[0]!);
    },
  );

  it.each(['light', 'dark'] as const)(
    'runs axe on the failure banner and conflict dialog in %s chrome',
    async (theme) => {
      const { store, client, container } = await setup();
      document.querySelector('[data-testid="editor-root"]')?.setAttribute('data-editor-theme', theme);
      dirty(store);
      failWrite(client, 409);
      await save(store);
      expect(await axeViolations(screen.getByRole('dialog'))).toEqual([]);
      act(() => {
        store.getState().dismissSaveError();
      });
      store.setState({
        saveError: { kind: 'http', status: 500 },
        saveErrorKey: 'save.error.server',
        saveStatus: 'failed',
      });
      expect(await axeViolations(container)).toEqual([]);
    },
  );

  it('renders the conflict dialog right-to-left for RTL editor locales', async () => {
    const { store, client } = await setup({ locale: 'ar' });
    dirty(store);
    failWrite(client, 409);
    await save(store);
    expect(screen.getByTestId('editor-root').getAttribute('dir')).toBe('rtl');
    expect(screen.getByRole('dialog').getAttribute('dir')).toBe('rtl');
  });
});

describe('Save Draft browser lifecycle', () => {
  it('registers beforeunload while dirty or saving and removes it when clean', async () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { store } = await setup();
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    dirty(store);
    await waitFor(() => expect(store.getState().dirty.layout).toBe(true));
    expect(add.mock.calls.some(([name]) => name === 'beforeunload')).toBe(true);
    const dirtyEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirtyEvent);
    expect(dirtyEvent.defaultPrevented).toBe(true);
    act(() => store.getState().markSaved({ layout: 6 }));
    await waitFor(() => expect(store.getState().dirty.layout).toBe(false));
    expect(remove.mock.calls.some(([name]) => name === 'beforeunload')).toBe(true);
    const cleanEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(cleanEvent);
    expect(cleanEvent.defaultPrevented).toBe(false);
    add.mockRestore();
    remove.mockRestore();
  });

  it('keeps the beforeunload guard active for the duration of a save', async () => {
    const { store, client } = await setup();
    dirty(store);
    client.writeLayout = vi.fn(() => new Promise(() => {}) as never);
    act(() => {
      void store.getState().saveDraft();
    });
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('caps Retry-After and performs one automatic retry', async () => {
    const { store, client } = await setup();
    vi.useFakeTimers();
    dirty(store);
    client.writeLayout = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: { kind: 'http', status: 429, data: { retryAfter: 90 } } })
      .mockResolvedValue({ ok: true, value: { revision: 8 } });
    await act(async () => {
      await store.getState().saveDraft();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(client.writeLayout).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(client.writeLayout).toHaveBeenCalledTimes(2);
  });

  it('retries once when online follows a network failure', async () => {
    const { store, client } = await setup();
    dirty(store);
    const write = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: { kind: 'network' } })
      .mockResolvedValue({ ok: true, value: { revision: 8 } });
    client.writeLayout = write as never;
    await save(store);
    act(() => window.dispatchEvent(new Event('online')));
    await waitFor(() => expect(client.writeLayout).toHaveBeenCalledTimes(2));
  });

  it('removes the online retry listener after a successful retry', async () => {
    const { store, client } = await setup();
    dirty(store);
    const write = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: { kind: 'network' } })
      .mockResolvedValue({ ok: true, value: { revision: 8 } });
    client.writeLayout = write as never;
    await save(store);
    act(() => window.dispatchEvent(new Event('online')));
    await waitFor(() => expect(store.getState().dirty.layout).toBe(false));
    expect(write).toHaveBeenCalledTimes(2);
    const count = write.mock.calls.length;
    act(() => window.dispatchEvent(new Event('online')));
    expect(write).toHaveBeenCalledTimes(count);
  });

  it('removes an online listener on unmount', async () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { store, client, unmount } = await setup();
    dirty(store);
    client.writeLayout = vi.fn().mockResolvedValue({ ok: false, error: { kind: 'network' } });
    await save(store);
    expect(add.mock.calls.some(([name]) => name === 'online')).toBe(true);
    unmount();
    expect(remove.mock.calls.some(([name]) => name === 'online')).toBe(true);
    add.mockRestore();
    remove.mockRestore();
  });

  it('clears the automatic retry timer when unmounted', async () => {
    const { store, client, unmount } = await setup();
    vi.useFakeTimers();
    dirty(store);
    client.writeLayout = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { kind: 'http', status: 429, data: { retryAfter: 15 } } });
    await act(async () => {
      await store.getState().saveDraft();
    });
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shows the 429 countdown in Dutch', async () => {
    const { store, client } = await setup({ locale: 'nl_NL' });
    dirty(store);
    client.writeLayout = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { kind: 'http', status: 429, data: { retryAfter: 4 } } });
    await save(store);
    expect(screen.getByText('Opnieuw proberen over 4 seconden.')).toBeTruthy();
  });

  it('aborts an in-flight write and clears retry timers and listeners on unmount', async () => {
    const { store, client, unmount } = await setup();
    vi.useFakeTimers();
    dirty(store);
    let signal: AbortSignal | undefined;
    client.writeLayout = vi.fn((_doc: unknown, _revision: number, options?: { signal?: AbortSignal }) => {
      signal = options?.signal;
      return new Promise(() => {}) as never;
    });
    act(() => {
      void store.getState().saveDraft();
    });
    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
