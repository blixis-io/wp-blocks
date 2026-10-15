import { act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BOOTSTRAP_ELEMENT_ID } from './bootstrap';
import { mountEditor } from './main';
import { makeBootstrap } from './test/fixtures';

describe('mountEditor', () => {
  it('mounts with an explicit bootstrap', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = mountEditor(container, makeBootstrap());
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.querySelector('[role="banner"]')).not.toBeNull();
    act(() => {
      root.unmount();
    });
  });

  it('hands the CSP nonce to the bundled UI libraries, and only when the bootstrap is valid', async () => {
    globalThis.__webpack_nonce__ = undefined;
    document.body.innerHTML = `<script type="application/json" id="${BOOTSTRAP_ELEMENT_ID}">{"version":1,"cspNonce":"AAAAAAAAAAAAAAAAAAAAAAAA"}</script>`;
    const bad = document.createElement('div');
    document.body.append(bad);
    const badRoot = mountEditor(bad);
    await act(async () => {
      await Promise.resolve();
    });
    expect(globalThis.__webpack_nonce__).toBeUndefined();
    act(() => {
      badRoot.unmount();
    });
    const container = document.createElement('div');
    document.body.append(container);
    const root = mountEditor(container, makeBootstrap({ cspNonce: 'bm9uY2UtMTIzNDU2Nzg5MA==' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(globalThis.__webpack_nonce__).toBe('bm9uY2UtMTIzNDU2Nzg5MA==');
    act(() => {
      root.unmount();
    });
  });

  it('reads the bootstrap script and shows the error screen when it is invalid', async () => {
    document.body.innerHTML = `<script type="application/json" id="${BOOTSTRAP_ELEMENT_ID}">{"version":1}</script>`;
    const container = document.createElement('div');
    document.body.append(container);
    const root = mountEditor(container);
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).not.toContain('version');
    act(() => {
      root.unmount();
    });
  });

  it('reads a valid bootstrap script', async () => {
    document.body.innerHTML = `<script type="application/json" id="${BOOTSTRAP_ELEMENT_ID}">${JSON.stringify(makeBootstrap())}</script>`;
    const container = document.createElement('div');
    document.body.append(container);
    const root = mountEditor(container);
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.querySelector('[role="toolbar"]')).not.toBeNull();
    act(() => {
      root.unmount();
    });
  });
});
