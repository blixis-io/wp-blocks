import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { MediaClient, MediaItem } from '../api/types';
import { MediaDialog } from './MediaDialog';
import { MediaProvider } from './MediaContext';
import { makeBootstrap } from '../test/fixtures';
import { MediaField } from './MediaField';

const image: MediaItem = {
  id: 4,
  url: `${location.origin}/full.png`,
  thumbUrl: `${location.origin}/thumb.png`,
  alt: 'Photo alt',
  title: '<b>Caption</b>',
  width: 20,
  height: 20,
  mime: 'image/png',
};
const secondImage: MediaItem = { ...image, id: 8, title: 'Second image' };
function fakeClient(): MediaClient & { listSpy: MediaClient['list']; uploadSpy: MediaClient['upload'] } {
  const listSpy: MediaClient['list'] = vi.fn(({ page = 1 } = {}) =>
    Promise.resolve({
      ok: true as const,
      value: { items: page === 1 ? [image, secondImage] : [{ ...image, id: 5 }], total: 3, totalPages: 2 },
    }),
  );
  const uploadSpy: MediaClient['upload'] = vi.fn(() =>
    Promise.resolve({ ok: true as const, value: { ...image, id: 6 } }),
  );
  const getSpy: MediaClient['get'] = vi.fn(() => Promise.resolve({ ok: true as const, value: image }));
  return { get: getSpy, list: listSpy, upload: uploadSpy, listSpy, uploadSpy };
}

describe('MediaDialog and MediaField', () => {
  it('is labelled, traps focus, closes on Escape and returns focus to its trigger', async () => {
    const client = fakeClient();
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              setOpen(true);
            }}
          >
            Open picker
          </button>
          <MediaDialog open={open} onOpenChange={setOpen} client={client} canUpload={false} onUse={() => undefined} />
        </>
      );
    }
    const user = userEvent.setup();
    render(<Host />);
    const trigger = screen.getByRole('button', { name: 'Open picker' });
    await user.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Choose an image' });
    await waitFor(() => {
      expect(vi.mocked(client.listSpy).mock.calls.length).toBe(1);
    });
    await user.click(await screen.findByRole('option', { name: /Caption/ }));
    const useButton = screen.getByRole('button', { name: 'Use image' });
    useButton.focus();
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(document.activeElement).toBe(trigger);
  });

  it('exposes listbox options, supports keyboard selection and confirmation', async () => {
    const client = fakeClient();
    const onUse = vi.fn();
    const onOpenChange = vi.fn();
    render(<MediaDialog open onOpenChange={onOpenChange} client={client} canUpload onUse={onUse} />);
    expect(await screen.findByRole('listbox', { name: 'Media library images' })).toBeTruthy();
    const option = await screen.findByRole('option', { name: /Caption/ });
    expect(option.getAttribute('aria-selected')).toBe('false');
    fireEvent.focus(option);
    fireEvent.keyDown(option, { key: 'Enter' });
    expect(onUse).toHaveBeenCalledWith(image);
  });

  it('moves the active option with arrows, selects with Space and confirms with Enter', async () => {
    const client = fakeClient();
    const onUse = vi.fn();
    render(<MediaDialog open onOpenChange={() => undefined} client={client} canUpload={false} onUse={onUse} />);
    const listbox = await screen.findByRole('listbox', { name: 'Media library images' });
    await screen.findByRole('option', { name: 'Second image' });
    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    expect(listbox.getAttribute('aria-activedescendant')).toBe('blx-media-8');
    const option = screen.getByRole('option', { name: 'Second image' });
    fireEvent.keyDown(option, { key: ' ' });
    expect(option.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(option, { key: 'Enter' });
    expect(onUse).toHaveBeenCalledWith(secondImage);
  });

  it('debounces search and loads another page', async () => {
    const client = fakeClient();
    render(<MediaDialog open onOpenChange={() => undefined} client={client} canUpload onUse={() => undefined} />);
    await screen.findByRole('option', { name: /Caption/ });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search images' }), { target: { value: 'banner' } });
    await waitFor(() => {
      expect(vi.mocked(client.listSpy).mock.calls.at(-1)?.[0]).toEqual({ search: 'banner', page: 1 });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByRole('option', { name: /Caption/ })).toBeTruthy();
  });

  it('hides uploads without capability and lets an authorized user upload', async () => {
    const client = fakeClient();
    const bootstrap = makeBootstrap({ canUpload: false });
    const view = render(
      <MediaProvider bootstrap={bootstrap}>
        <MediaField label="Featured image" value={null} onSelect={() => undefined} />
      </MediaProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Choose image' }));
    expect((await screen.findByRole('note')).textContent).toContain('do not have permission');
    expect(screen.queryByRole('button', { name: 'Upload image' })).toBeNull();
    view.unmount();
    render(<MediaDialog open onOpenChange={() => undefined} client={client} canUpload onUse={() => undefined} />);
    const file = new File(['image bytes'], 'image.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Upload image'), { target: { files: [file] } });
    expect(await screen.findByRole('option', { name: /Caption/ })).toBeTruthy();
    await waitFor(() => {
      expect(vi.mocked(client.uploadSpy).mock.calls.length).toBe(1);
    });
  });

  it('shows retry state when media listing fails', async () => {
    const client = fakeClient();
    client.list = vi.fn(() => Promise.resolve({ ok: false as const, error: { kind: 'network' as const } }));
    render(
      <MediaDialog open onOpenChange={() => undefined} client={client} canUpload={false} onUse={() => undefined} />,
    );
    expect((await screen.findByRole('alert')).textContent).toContain('Could not load images');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('shows upload rejection beside the selected file status', async () => {
    const client = fakeClient();
    client.upload = () => Promise.resolve({ ok: false, error: { kind: 'http', code: 'media_unsupported_type' } });
    render(<MediaDialog open onOpenChange={() => undefined} client={client} canUpload onUse={() => undefined} />);
    const file = new File(['svg'], 'unsupported.svg', { type: 'image/svg+xml' });
    fireEvent.change(screen.getByLabelText('Upload image'), { target: { files: [file] } });
    expect((await screen.findByRole('alert')).textContent).toContain('unsupported.svg');
  });
});
