// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createCoreRegistry } from '@blixis/wp-element-registry';
import type { ElementNode } from '@blixis/wp-core';
import { StoreProvider, useEditorStore } from '../state';
import { I18nProvider } from '../i18n-react';
import { el, makeDocument, makeLoadedStore } from '../test/state-helpers';
import { axeViolations } from '../test/axe';
import { Inspector } from './Inspector';

const registry = createCoreRegistry();
afterEach(cleanup);

function ReactiveInspector({ tab, editable }: { tab: 'content' | 'style' | 'settings'; editable: boolean }) {
  const element = useEditorStore(
    (state) => state.document?.root.find((node) => node.id === state.selectedId) ?? state.document?.root[0] ?? null,
  );
  return <Inspector element={element} tab={tab} editingEnabled={editable} />;
}

async function mount(
  type = 'blixis/heading',
  options: {
    editable?: boolean;
    locale?: string;
    tab?: 'content' | 'style' | 'settings';
    lockReason?: string;
    style?: ElementNode['style'];
    reactive?: boolean;
  } = {},
) {
  const target = el('target', type);
  if (options.style) target.style = options.style;
  const { store } = await makeLoadedStore({
    document: makeDocument({
      root: [target],
      locales: ['en_US', 'fr_FR'],
      translations: { en_US: { target: { values: { text: 'Source' }, status: 'translated' } }, fr_FR: {} },
    }),
  });
  store.getState().setContentLocale(options.locale ?? 'en_US');
  const node = store.getState().document?.root[0] ?? null;
  const view = render(
    <StoreProvider store={store}>
      <I18nProvider editorLocale="en_US">
        {options.reactive === false ? (
          <Inspector element={node} tab={options.tab ?? 'content'} editingEnabled={options.editable ?? true} />
        ) : (
          <ReactiveInspector tab={options.tab ?? 'content'} editable={options.editable ?? true} />
        )}
      </I18nProvider>
    </StoreProvider>,
  );
  return { store, ...view };
}

describe('Inspector controls', () => {
  it('renders text and textarea schema controls', async () => {
    await mount('blixis/text');
    expect(screen.getByRole('textbox', { name: 'Text' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Text' }).tagName).toBe('TEXTAREA');
  });

  it('renders a numeric heading level control', async () => {
    await mount('blixis/heading', { tab: 'settings' });
    expect(screen.getByRole('spinbutton', { name: 'Heading level' })).toBeTruthy();
  });

  it('renders enum and boolean controls from the element schema', async () => {
    await mount('blixis/button', { tab: 'settings' });
    expect(screen.getByRole('checkbox', { name: 'Open in a new tab' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Button style' })).toBeTruthy();
  });

  it('renders media library guidance and translatable alternative text controls', async () => {
    const { store } = await mount('blixis/image');
    expect(screen.getByText(/Choose an image from the media library/)).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Alternative text' })).toBeTruthy();
    expect(screen.getByText('Add alternative text, or mark this image as decorative.')).toBeTruthy();
    act(() => {
      store.getState().dispatch({ type: 'update-props', id: 'target', set: { decorative: true } });
    });
    expect(screen.queryByText('Add alternative text, or mark this image as decorative.')).toBeNull();
  });

  it('updates invariant properties through update-props', async () => {
    const { store } = await mount('blixis/image', { tab: 'settings' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Decorative image' }));
    expect(store.getState().document?.root[0]?.props['decorative']).toBe(true);
  });

  it('updates the current content locale with a translation command', async () => {
    const { store } = await mount('blixis/heading', { locale: 'fr_FR' });
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'Bonjour' } });
    expect(store.getState().document?.translations['fr_FR']?.['target']?.values['text']).toBe('Bonjour');
    expect(store.getState().document?.translations['en_US']?.['target']?.values['text']).toBe('Source');
  });

  it('resets drafts across selection and locale changes and follows undo and redo', async () => {
    const first = el('first', 'blixis/heading');
    const second = el('second', 'blixis/heading');
    const { store } = await makeLoadedStore({
      document: makeDocument({
        root: [first, second],
        locales: ['en_US', 'fr_FR'],
        translations: {
          en_US: {
            first: { values: { text: 'First value' }, status: 'translated' },
            second: { values: { text: 'Second value' }, status: 'translated' },
          },
          fr_FR: {
            first: { values: { text: 'Premier' }, status: 'translated' },
            second: { values: { text: 'Deuxième' }, status: 'translated' },
          },
        },
      }),
    });
    act(() => {
      store.getState().setContentLocale('en_US');
    });
    act(() => {
      store.getState().select('first');
    });
    const view = render(
      <StoreProvider store={store}>
        <I18nProvider editorLocale="en_US">
          <ReactiveInspector tab="content" editable />
        </I18nProvider>
      </StoreProvider>,
    );
    const field = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Text' });
    fireEvent.change(field, { target: { value: 'Edited first' } });
    act(() => {
      store.getState().undo();
    });
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Text' }).value).toBe('First value');
    act(() => {
      store.getState().redo();
    });
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Text' }).value).toBe('Edited first');
    act(() => {
      store.getState().select('second');
    });
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Text' }).value).toBe('Second value');
    fireEvent.change(screen.getByRole('textbox', { name: 'Text' }), { target: { value: 'Edited second' } });
    expect(store.getState().document?.translations['en_US']?.['second']?.values['text']).toBe('Edited second');
    expect(store.getState().document?.translations['en_US']?.['first']?.values['text']).toBe('Edited first');
    expect(store.getState().document?.translations['en_US']?.['second']?.values['text']).toBe('Edited second');
    act(() => {
      store.getState().setContentLocale('fr_FR');
    });
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Text' }).value).toBe('Deuxième');
    act(() => {
      store.getState().select('first');
    });
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Text' }).value).toBe('Premier');
    view.unmount();
  });

  it('keeps read-only controls disabled', async () => {
    await mount('blixis/heading', { editable: false, lockReason: 'Theme does not support editing' });
    expect(screen.getByLabelText('Text').getAttribute('disabled')).not.toBeNull();
  });

  it('keeps invariant controls read-only with the supplied reason while editing is disabled', async () => {
    await mount('blixis/button', { editable: false, lockReason: 'Account is view only', tab: 'settings' });
    expect(screen.getByRole('checkbox', { name: 'Open in a new tab' }).hasAttribute('disabled')).toBe(true);
  });

  it('renders each registered core element type without a schema mapping failure', async () => {
    for (const type of [
      'blixis/section',
      'blixis/container',
      'blixis/heading',
      'blixis/text',
      'blixis/image',
      'blixis/button',
    ]) {
      const definition = registry.get(type);
      expect(definition).toBeDefined();
      const { unmount } = await mount(type);
      expect(screen.queryByRole('alert')).toBeNull();
      if (type === 'blixis/section' || type === 'blixis/container') {
        expect(screen.getByText('This element has no content properties.')).toBeTruthy();
      } else if (type === 'blixis/image') {
        expect(screen.getByRole('textbox', { name: 'Alternative text' })).toBeTruthy();
      } else if (type === 'blixis/button') {
        expect(screen.getByRole('textbox', { name: 'Label' })).toBeTruthy();
      } else {
        expect(screen.getByRole('textbox', { name: 'Text' })).toBeTruthy();
      }
      unmount();
    }
  });

  it('renders the URL field and rejects unsafe URL schemes before dispatch', async () => {
    const { store } = await mount('blixis/button');
    const url = screen.getByLabelText('Link');
    fireEvent.change(url, { target: { value: 'javascript:alert(1)' } });
    fireEvent.blur(url);
    expect(screen.getByRole('alert').textContent).toContain('safe link');
    expect(store.getState().document?.root[0]?.props['href']).toBeUndefined();
    expect(url.getAttribute('aria-describedby')).toBeTruthy();
  });

  it.each([
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    'data:text/html,x',
    'vbscript:msgbox(1)',
    '//evil.example/x',
    '///evil.example/x',
    '\\\\evil.example\\x',
    'java\nscript:alert(1)',
    'data:image/svg+xml,<svg/>',
    'vbscript :alert(1)',
  ])('never dispatches unsafe inspector URL draft %s', async (url) => {
    const { store } = await mount('blixis/button');
    const field = screen.getByRole<HTMLInputElement>('textbox', { name: 'Link' });
    fireEvent.change(field, { target: { value: url } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(store.getState().document?.translations['en_US']?.['target']?.values['href']).toBeUndefined();
    expect(screen.getByRole('alert').textContent).toContain('safe link');
  });

  it.each(['https://example.test', 'http://example.test/a', '/relative/path', 'mailto:a@example.test', 'tel:+123'])(
    'commits a complete safe inspector URL on Enter: %s',
    async (url) => {
      const { store } = await mount('blixis/button');
      const field = screen.getByRole<HTMLInputElement>('textbox', { name: 'Link' });
      fireEvent.change(field, { target: { value: url } });
      expect(store.getState().document?.translations['en_US']?.['target']?.values['href']).toBeUndefined();
      fireEvent.keyDown(field, { key: 'Enter' });
      expect(store.getState().document?.translations['en_US']?.['target']?.values['href']).toBe(url);
    },
  );

  it('renders RTL-compatible content without physical direction styles', async () => {
    await mount('blixis/heading');
    expect(document.querySelector('[dir="rtl"]')).toBeNull();
    expect(document.querySelector('input')?.getAttribute('dir')).not.toBe('ltr');
  });

  it('keeps a rejected draft visible while reporting a command error', async () => {
    await mount('blixis/button');
    const url = screen.getByLabelText<HTMLInputElement>('Link');
    fireEvent.change(url, { target: { value: 'javascript:bad()' } });
    fireEvent.blur(url);
    expect(url.value).toBe('javascript:bad()');
    expect(within(screen.getByRole('group')).getByRole('alert')).toBeTruthy();
  });

  it('shows command failures as an alert described by the field and keeps the draft', async () => {
    const { store } = await mount('blixis/heading', { reactive: false });
    store.getState().dispatch({ type: 'remove', id: 'target' });
    const field = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Text' });
    fireEvent.change(field, { target: { value: 'Draft that could not save' } });
    const alert = screen.getByRole('alert');
    expect(alert.id).toBe(field.getAttribute('aria-describedby'));
    expect(field.value).toBe('Draft that could not save');
    expect(alert.textContent).toBeTruthy();
  });

  it('resets spacing and typography overrides to the inherited value for the selected viewport', async () => {
    const { store } = await mount('blixis/heading', {
      tab: 'style',
      style: [
        { declarations: { margin: 'var(--blx-space-2)', 'font-size': 'var(--blx-text-lg)' } },
        {
          breakpoint: 'tablet',
          declarations: { 'margin-block-start': 'var(--blx-space-3)', 'font-size': 'var(--blx-text-xl)' },
        },
      ],
    });
    act(() => {
      store.getState().setViewport('mobile');
    });
    expect(screen.getAllByText(/Using inherited value/).length).toBeGreaterThan(0);
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Font size' }).value).toBe('');
    act(() => {
      expect(
        store.getState().dispatch({
          type: 'set-style-rule',
          id: 'target',
          selector: { breakpoint: 'mobile' },
          declarations: { 'margin-inline-end': 'var(--blx-space-4)', 'font-size': 'var(--blx-text-2xl)' },
        }).ok,
      ).toBe(true);
    });
    expect(screen.getAllByText(/Overridden at this breakpoint/).length).toBeGreaterThan(0);
    const spacingReset = screen.getAllByRole('button', { name: 'Reset Margin to inherited' })[0];
    if (!spacingReset) throw new Error('Spacing reset control is missing');
    fireEvent.click(spacingReset);
    fireEvent.click(screen.getByRole('button', { name: 'Reset Font size to inherited' }));
    expect(store.getState().document?.root[0]?.style).toEqual([
      { declarations: { margin: 'var(--blx-space-2)', 'font-size': 'var(--blx-text-lg)' } },
      {
        breakpoint: 'tablet',
        declarations: { 'margin-block-start': 'var(--blx-space-3)', 'font-size': 'var(--blx-text-xl)' },
      },
    ]);
    act(() => {
      store.getState().setViewport('tablet');
    });
    expect(screen.getByRole('heading', { name: 'Tablet styles' })).toBeTruthy();
  });

  it.each(['blixis/section', 'blixis/container', 'blixis/heading', 'blixis/text', 'blixis/image', 'blixis/button'])(
    '%s has no axe violations on all inspector tabs',
    async (type) => {
      for (const tab of ['content', 'style', 'settings'] as const) {
        const view = await mount(type, { tab });
        expect(await axeViolations(view.container)).toEqual([]);
        view.unmount();
      }
    },
  );

  it('tracks inherited indicators as viewport selection changes', async () => {
    const { store } = await mount('blixis/heading', {
      tab: 'style',
      style: [
        { declarations: { color: 'var(--blx-color-text)' } },
        { breakpoint: 'tablet', declarations: { color: 'var(--blx-color-primary)' } },
        { breakpoint: 'mobile', mode: 'dark', declarations: { color: 'var(--blx-color-surface)' } },
        { breakpoint: 'mobile', state: 'hover', declarations: { color: 'var(--blx-color-link)' } },
      ],
    });
    act(() => {
      store.getState().setViewport('desktop');
    });
    expect(screen.getByRole('heading', { name: 'Desktop styles' })).toBeTruthy();
    act(() => {
      store.getState().setViewport('mobile');
    });
    expect(screen.getByRole('heading', { name: 'Mobile styles' })).toBeTruthy();
    expect(screen.getByText(/Using inherited value/)).toBeTruthy();
    expect(screen.queryByText(/Overridden at this breakpoint/)).toBeNull();
  });

  it('keeps selection and field edits responsive in a 5,000 element document', async () => {
    const elements = Array.from({ length: 5000 }, (_, index) => el(`target-${String(index)}`, 'blixis/heading'));
    const started = performance.now();
    const { store } = await makeLoadedStore({
      document: makeDocument({
        root: elements,
        translations: {
          en_US: Object.fromEntries(
            elements.map((item) => [item.id, { values: { text: item.id }, status: 'translated' }]),
          ),
          fr_FR: {},
        },
      }),
    });
    store.getState().setContentLocale('en_US');
    const selected = elements.at(4999);
    if (!selected) throw new Error('Expected the final document element');
    expect(store.getState().select('target-0')).toBe(true);
    const view = render(
      <StoreProvider store={store}>
        <I18nProvider editorLocale="en_US">
          <ReactiveInspector tab="content" editable />
        </I18nProvider>
      </StoreProvider>,
    );
    act(() => {
      expect(store.getState().select(selected.id)).toBe(true);
    });
    const textbox = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Text' });
    fireEvent.change(textbox, { target: { value: 'Responsive edit' } });
    expect(store.getState().document?.translations['en_US']?.[selected.id]?.values['text']).toBe('Responsive edit');
    expect(performance.now() - started).toBeLessThan(15000);
    view.unmount();
  }, 30_000);

  it.each(['blixis/section', 'blixis/container', 'blixis/heading', 'blixis/text', 'blixis/image', 'blixis/button'])(
    'keeps %s content controls accessible',
    async (type) => {
      const { container } = await mount(type);
      expect(await axeViolations(container)).toEqual([]);
    },
  );
});
