// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCoreRegistry } from '@blixis/wp-element-registry';
import type { ElementNode } from '@blixis/wp-core';
import { StoreProvider, useEditorStore } from '../state';
import { I18nProvider } from '../i18n-react';
import { el, makeDocument, makeLoadedStore } from '../test/state-helpers';
import { axeViolations } from '../test/axe';
import { Inspector } from './Inspector';
import { STYLE_FIELDS } from './style-mapping';
import { PROPERTIES } from '@blixis/wp-style-engine';

const registry = createCoreRegistry();
const styleSchemaCases = registry.list().flatMap((definition) =>
  STYLE_FIELDS.filter((field) => !['margin', 'padding', 'border-width'].includes(field.id)).map((field) => ({
    type: definition.type,
    property: field.id,
    supported: definition.styleProperties.includes(field.id) && PROPERTIES.has(field.id),
  })),
);
const styleDispatchCases = styleSchemaCases.filter(({ supported }) => supported);
const styleLabels: Readonly<Record<string, string>> = {
  'font-family': 'Font family',
  'font-weight': 'Font weight',
  'font-size': 'Size',
  'line-height': 'Line height',
  'letter-spacing': 'Letter spacing',
  'text-transform': 'Text transform',
  color: 'Color',
  'background-color': 'Background color',
  width: 'Width',
  'text-align': 'Text align',
  display: 'Display',
  'border-radius': 'Border radius',
  'border-width': 'Border width',
  'border-style': 'Border style',
  'border-color': 'Border color',
  'box-shadow': 'Box shadow',
};
afterEach(cleanup);
beforeEach(() => {
  sessionStorage.clear();
});

function ReactiveInspector({ tab, editable }: { tab: 'content' | 'style' | 'advanced'; editable: boolean }) {
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
    editorLocale?: string;
    tab?: 'content' | 'style' | 'advanced';
    lockReason?: string;
    style?: ElementNode['style'];
    reactive?: boolean;
    chromeTheme?: 'light' | 'dark';
    preserveSectionDefaults?: boolean;
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
      <I18nProvider editorLocale={options.editorLocale ?? 'en_US'}>
        <div className="blx-editor" data-editor-theme={options.chromeTheme ?? 'light'}>
          {options.reactive === false ? (
            <Inspector element={node} tab={options.tab ?? 'content'} editingEnabled={options.editable ?? true} />
          ) : (
            <ReactiveInspector tab={options.tab ?? 'content'} editable={options.editable ?? true} />
          )}
        </div>
      </I18nProvider>
    </StoreProvider>,
  );
  if (options.tab === 'style' && !options.preserveSectionDefaults) {
    for (const id of ['style-layout', 'style-effects']) {
      const toggle = document.querySelector<HTMLButtonElement>(`button[aria-controls="inspector-section-${id}-panel"]`);
      if (!toggle) throw new Error(`Missing inspector section toggle: ${id}`);
      if (toggle.getAttribute('aria-expanded') === 'false') fireEvent.click(toggle);
    }
  }
  return { store, ...view };
}

describe('Inspector controls', () => {
  it('opens Typography and Color by default and collapses Layout and Border & Effects', async () => {
    await mount('blixis/heading', { tab: 'style', preserveSectionDefaults: true });
    for (const [name, state] of [
      ['Typography', 'true'],
      ['Color', 'true'],
      ['Layout', 'false'],
      ['Border & Effects', 'false'],
    ] as const) {
      expect(screen.getByRole('button', { name: `Toggle ${name}` }).getAttribute('aria-expanded')).toBe(state);
    }
  });

  it('renders Content fields in a borderless group container instead of a native fieldset', async () => {
    const { container } = await mount('blixis/heading', { tab: 'content' });
    expect(container.querySelector('fieldset.blx-inspector-group')).toBeNull();
    expect(container.querySelector('div.blx-inspector-group')).toBeTruthy();
  });

  it('collapses a section with a real button, exposes its region, and remembers state for the session', async () => {
    const user = userEvent.setup();
    const first = await mount('blixis/heading');
    const toggle = screen.getByRole('button', { name: 'Toggle Heading' });
    const panelId = toggle.getAttribute('aria-controls');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    toggle.focus();
    await user.keyboard(' ');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(panelId && document.getElementById(panelId)?.hasAttribute('hidden')).toBe(true);
    first.unmount();
    const second = await mount('blixis/heading');
    expect(screen.getByRole('button', { name: 'Toggle Heading' }).getAttribute('aria-expanded')).toBe('false');
    second.unmount();
  });

  it('keeps Style section collapse state across element changes while Content state stays separate', async () => {
    const user = userEvent.setup();
    const first = el('first', 'blixis/heading');
    const second = el('second', 'blixis/text');
    const { store } = await makeLoadedStore({ document: makeDocument({ root: [first, second] }) });
    const renderInspector = (element: ElementNode, tab: 'content' | 'style') => (
      <StoreProvider store={store}>
        <I18nProvider editorLocale="en_US">
          <Inspector element={element} tab={tab} editingEnabled />
        </I18nProvider>
      </StoreProvider>
    );
    const view = render(renderInspector(first, 'style'));
    const typography = screen.getByRole('button', { name: 'Toggle Typography' });
    expect(typography.getAttribute('aria-controls')).toBeTruthy();
    typography.focus();
    await user.keyboard('{Enter}');
    expect(typography.getAttribute('aria-expanded')).toBe('false');
    view.rerender(renderInspector(second, 'style'));
    expect(screen.getByRole('button', { name: 'Toggle Typography' }).getAttribute('aria-expanded')).toBe('false');
    view.unmount();
    await mount('blixis/heading', { tab: 'content' });
    expect(screen.getByRole('button', { name: 'Toggle Heading' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('makes future-only inspector placeholders disabled and associates their hints', async () => {
    await mount('blixis/heading');
    for (const label of ['Static Content', 'Inline Editing', 'Translation']) {
      const control = screen.getByRole(label === 'Static Content' ? 'combobox' : 'checkbox', { name: label });
      expect(control.getAttribute('aria-disabled')).toBe('true');
      expect(control.getAttribute('aria-describedby')).toBeTruthy();
      expect(control.hasAttribute('disabled')).toBe(true);
    }
    expect(screen.getByText(/BWB-084/)).toBeTruthy();
    expect(screen.getAllByText(/BWB-135/)).toHaveLength(2);
    expect(screen.getByText(/BWB-114/)).toBeTruthy();
  });

  it('renders text and textarea schema controls', async () => {
    await mount('blixis/text');
    expect(screen.getByRole('textbox', { name: 'Text' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Text' }).tagName).toBe('TEXTAREA');
  });

  it('renders the schema-backed heading tag control', async () => {
    await mount('blixis/heading', { tab: 'content' });
    expect(screen.getByRole('combobox', { name: 'Heading level' })).toBeTruthy();
  });

  it('renders enum and boolean controls from the element schema', async () => {
    await mount('blixis/button', { tab: 'content' });
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
    const { store } = await mount('blixis/image', { tab: 'content' });
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
    await mount('blixis/button', { editable: false, lockReason: 'Account is view only', tab: 'content' });
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
        expect(screen.getByRole('region', { name: type === 'blixis/section' ? 'Section' : 'Container' })).toBeTruthy();
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
    const url = screen.getByRole('textbox', { name: 'Link' });
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
    const url = screen.getByRole<HTMLInputElement>('textbox', { name: 'Link' });
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
    expect(screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Size' }).value).toBe('16');
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
    fireEvent.focus(screen.getByRole('spinbutton', { name: 'Margin End' }));
    const spacingReset = screen.getByRole('button', { name: 'Reset Margin End to inherited' });
    fireEvent.click(spacingReset);
    fireEvent.click(screen.getByRole('button', { name: 'Reset Size to inherited' }));
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
    expect(screen.getByText('Tablet styles')).toBeTruthy();
  });

  it('links all four spacing sides and dispatches the exact current-breakpoint declaration', async () => {
    const { store } = await mount('blixis/heading', { tab: 'style' });
    fireEvent.click(screen.getByRole('button', { name: 'Link Margin sides' }));
    const marginTop = screen.getAllByRole('spinbutton', { name: 'Margin Top' })[0];
    if (!marginTop) throw new Error('Margin top control is missing');
    fireEvent.change(marginTop, { target: { value: '24' } });
    expect(store.getState().document?.root[0]?.style?.[0]?.declarations).toMatchObject({
      'margin-block-start': '24px',
      'margin-inline-end': '24px',
      'margin-block-end': '24px',
      'margin-inline-start': '24px',
    });
  });

  it('keeps style labels and controls in the same property row and formats CSS decimals with a dot in Dutch', async () => {
    const { container } = await mount('blixis/heading', {
      tab: 'style',
      editorLocale: 'nl_NL',
      style: [{ declarations: { 'font-size': '2.75rem' } }],
    });
    const input = container.querySelector<HTMLInputElement>('#style-target-font-size');
    expect(input).toBeTruthy();
    if (!input) throw new Error('Size numeric input is missing');
    expect(input.value).toBe('2.75');
    const row = input.closest('.blx-inspector-field');
    const label = row?.querySelector(':scope > .blx-inspector-label > label');
    const cluster = row?.querySelector(':scope > .blx-style-control-cluster');
    expect(label).toBeTruthy();
    expect(cluster).toBeTruthy();
    expect(label?.parentElement).toBe(row?.querySelector(':scope > .blx-inspector-label'));
    expect(row?.querySelector('.blx-style-viewport')?.parentElement).toBe(label?.parentElement);
    expect(row?.querySelector('.blx-inspector-label')?.className).toContain('blx-inspector-label');
    expect(row?.querySelector('.blx-inspector-label .blx-style-viewport')).toBeTruthy();
    expect(row?.querySelector('.blx-slider-field .blx-number-unit')).toBeTruthy();
  });

  it('renders compact color, gradient and box model structures', async () => {
    const { container } = await mount('blixis/heading', { tab: 'style' });
    const color = container.querySelector('.blx-color-field');
    expect(color?.querySelector('.blx-color-swatch')).toBeTruthy();
    expect(color?.querySelector('select[aria-label="Color"]')).toBeTruthy();
    const gradient = container.querySelector('.blx-gradient-field');
    expect(gradient?.querySelector('.blx-inspector-toggle-row input')).toBeTruthy();
    expect(gradient?.querySelector('.blx-inspector-hint')).toBeTruthy();
    expect(container.querySelectorAll('.blx-box-model-layer')).toHaveLength(3);
  });

  it.each(['en_US', 'nl_NL'] as const)('shows unique, unclipped style labels in %s', async (editorLocale) => {
    const { container } = await mount('blixis/heading', { tab: 'style', editorLocale });
    const labels = [
      ...container.querySelectorAll<HTMLElement>('.blx-inspector-label > label, .blx-inspector-label > span'),
    ];
    const texts = labels.map((label) => label.textContent.trim());
    expect(new Set(texts).size).toBe(texts.length);
    expect(texts.every((text) => text.length > 0 && !text.endsWith('…'))).toBe(true);
    expect(labels.every((label) => label.scrollWidth <= label.clientWidth)).toBe(true);
    expect(container.textContent).not.toMatch(/var\(--/);
  });

  it.each(['content', 'style', 'advanced'] as const)(
    'keeps visible inspector labels unique on the %s tab',
    async (tab) => {
      const { container } = await mount('blixis/heading', { tab });
      const labels = [...container.querySelectorAll('label')].map((label) => label.textContent.trim());
      expect(new Set(labels).size).toBe(labels.length);
    },
  );

  it('always selects a visible valid unit for default border dimensions', async () => {
    await mount('blixis/heading', { tab: 'style' });
    for (const label of ['Border radius unit']) {
      const unit = screen.getByRole<HTMLSelectElement>('combobox', { name: label });
      expect(unit.value).toBe('px');
      expect(unit.selectedIndex).toBeGreaterThanOrEqual(0);
      expect(unit.options[unit.selectedIndex]?.textContent).toBe('px');
    }
  });

  it('never renders raw CSS custom property tokens in the Style DOM', async () => {
    const { container } = await mount('blixis/heading', { tab: 'style' });
    const visibleText = [...container.querySelectorAll<HTMLElement>('*')]
      .filter((node) => node.childElementCount === 0)
      .map((node) => node.textContent)
      .join(' ');
    expect(visibleText).not.toMatch(/var\(--/);
  });

  it('converts units and preserves out-of-range values while clamping only the slider thumb', async () => {
    const converted = await mount('blixis/heading', {
      tab: 'style',
      style: [{ declarations: { 'font-size': '44px' } }],
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Size unit' }), { target: { value: 'rem' } });
    expect(screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Size' }).value).toBe('2.75');
    expect(screen.getByRole('slider', { name: 'Size' }).getAttribute('aria-valuemin')).toBe('0.5');
    expect(converted.store.getState().document?.root[0]?.style?.[0]?.declarations['font-size']).toBe('2.75rem');

    converted.unmount();
    const outOfRange = await mount('blixis/heading', {
      tab: 'style',
      style: [{ declarations: { 'font-size': '120px' } }],
    });
    expect(screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Size' }).value).toBe('120');
    expect(screen.getByRole('slider', { name: 'Size' }).getAttribute('aria-valuenow')).toBe('96');
    expect(outOfRange.store.getState().document?.root[0]?.style?.[0]?.declarations['font-size']).toBe('120px');
  });

  it('applies an active class to the selected segmented style option', async () => {
    await mount('blixis/heading', { tab: 'style' });
    const alignGroup = screen.getByRole('radiogroup', { name: 'Text align' });
    expect(within(alignGroup).getByRole('radio', { name: 'Align left' }).className).toContain('is-active');
  });

  it('reports invalid unit values without changing the document', async () => {
    const { store } = await mount('blixis/heading', { tab: 'style' });
    const paddingTop = screen.getByRole('spinbutton', { name: 'Padding Top' });
    fireEvent.focus(paddingTop);
    fireEvent.change(paddingTop, { target: { value: '-1' } });
    expect(screen.getByRole('alert').textContent).toBe('This value does not meet the requirements for this field.');
    expect(store.getState().document?.root[0]?.style).toBeUndefined();
  });

  it.each(['blixis/section', 'blixis/container', 'blixis/heading', 'blixis/text', 'blixis/image', 'blixis/button'])(
    '%s has no axe violations on all inspector tabs',
    async (type) => {
      for (const tab of ['content', 'style', 'advanced'] as const) {
        const view = await mount(type, { tab });
        expect(await axeViolations(view.container)).toEqual([]);
        view.unmount();
      }
    },
  );

  it.each(
    ['blixis/section', 'blixis/container', 'blixis/heading', 'blixis/text', 'blixis/image', 'blixis/button'].flatMap(
      (type) =>
        (['content', 'style', 'advanced'] as const).flatMap((tab) =>
          (['light', 'dark'] as const).map((chromeTheme) => ({ type, tab, chromeTheme })),
        ),
    ),
  )('keeps $type $tab inspector accessible in $chromeTheme chrome', async ({ type, tab, chromeTheme }) => {
    const view = await mount(type, { tab, chromeTheme });
    expect(await axeViolations(view.container)).toEqual([]);
  });

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
    expect(screen.getByText('Desktop styles')).toBeTruthy();
    act(() => {
      store.getState().setViewport('mobile');
    });
    expect(screen.getByText('Mobile styles')).toBeTruthy();
    expect(screen.getByText(/Using inherited value/)).toBeTruthy();
    expect(screen.queryByText(/Overridden at this breakpoint/)).toBeNull();
  });

  it.each([
    ['font-family', 'var(--blx-font-body)'],
    ['font-weight', '600'],
    ['text-transform', 'uppercase'],
    ['text-align', 'left'],
    ['width', '100%'],
    ['display', 'inline-block'],
    ['border-style', 'dashed'],
    ['box-shadow', 'none'],
  ])('dispatches %s as an exact style declaration', async (property, value) => {
    const { store } = await mount('blixis/heading', { tab: 'style' });
    if (['font-family', 'font-weight'].includes(property)) {
      const labels: Record<string, string> = {
        'font-family': 'Font family',
        'font-weight': 'Font weight',
      };
      fireEvent.change(screen.getByLabelText(labels[property] ?? property), { target: { value } });
    } else if (['text-transform', 'width', 'display'].includes(property)) {
      fireEvent.change(screen.getByRole('combobox', { name: styleLabels[property] ?? property }), {
        target: { value },
      });
    } else {
      fireEvent.click(
        property === 'box-shadow'
          ? within(screen.getByRole('radiogroup', { name: 'Box shadow' })).getByRole('radio', {
              name: value === 'none' ? 'None' : value === 'var(--blx-shadow-card)' ? 'Card' : value,
            })
          : screen.getByRole('radio', {
              name:
                property === 'text-align'
                  ? `Align ${value}`
                  : property === 'border-style'
                    ? value === 'dashed'
                      ? 'Dashed'
                      : value
                    : value,
            }),
      );
    }
    expect(store.getState().document?.root[0]?.style?.[0]?.declarations[property]).toBe(value);
  });

  it.each([
    ['blixis/section', 'font-size'],
    ['blixis/container', 'text-align'],
    ['blixis/image', 'font-weight'],
    ['blixis/image', 'font-family'],
    ['blixis/heading', 'background-color'],
    ['blixis/text', 'background-color'],
  ])('omits unsupported style property %s / %s', async (type, property) => {
    const { container } = await mount(type, { tab: 'style' });
    expect(container.querySelector(`#style-target-${property}`)).toBeNull();
  });

  it.each(styleSchemaCases)(
    '$type style row $property follows the element registry schema and compiler allowlist',
    async ({ type, property, supported }) => {
      const { container } = await mount(type, { tab: 'style' });
      expect(container.querySelector(`#style-target-${property}`) !== null).toBe(supported);
    },
  );

  it.each(styleDispatchCases)(
    '$type style row $property dispatches its exact allowlisted property value',
    async ({ type, property }) => {
      const { store } = await mount(type, { tab: 'style' });
      const label = styleLabels[property];
      const values: Readonly<Record<string, string>> = {
        'font-family': 'var(--blx-font-body)',
        'font-weight': '600',
        'font-size': '24',
        'line-height': '1.8',
        'letter-spacing': '2',
        'text-transform': 'uppercase',
        color: 'var(--blx-color-primary)',
        'background-color': 'var(--blx-color-primary)',
        width: '100%',
        'text-align': 'right',
        display: 'inline-block',
        'border-radius': '18',
        'border-width': '2',
        'border-style': 'dashed',
        'border-color': 'var(--blx-color-primary)',
        'box-shadow': 'none',
      };
      const next = values[property];
      if (next === undefined || label === undefined) throw new Error(`No inspector test value for ${property}`);
      if (['font-family', 'font-weight'].includes(property)) {
        fireEvent.change(screen.getByLabelText(label), { target: { value: next } });
      } else if (['font-size', 'line-height', 'letter-spacing', 'border-radius', 'border-width'].includes(property)) {
        fireEvent.change(screen.getByRole('spinbutton', { name: label }), { target: { value: next } });
      } else if (
        ['color', 'background-color', 'border-color', 'text-transform', 'width', 'display'].includes(property)
      ) {
        fireEvent.change(screen.getByRole('combobox', { name: label }), { target: { value: next } });
      } else {
        const radioGroup = within(screen.getByRole('radiogroup', { name: label }));
        const accessibleName =
          property === 'text-align'
            ? `Align ${next}`
            : property === 'border-style'
              ? next === 'dashed'
                ? 'Dashed'
                : next
              : property === 'box-shadow'
                ? next === 'none'
                  ? 'None'
                  : 'Card'
                : next;
        fireEvent.click(radioGroup.getByRole('radio', { name: accessibleName }));
      }
      const expected =
        property === 'font-size' ||
        property === 'letter-spacing' ||
        property === 'border-radius' ||
        property === 'border-width'
          ? `${next}px`
          : next;
      expect(store.getState().document?.root[0]?.style?.[0]?.declarations[property]).toBe(expected);
    },
  );

  it('uses a roving radio tab stop and Arrow keys for segmented style controls', async () => {
    const { store } = await mount('blixis/heading', { tab: 'style' });
    const alignment = within(screen.getByRole('radiogroup', { name: 'Text align' }));
    const left = alignment.getByRole('radio', { name: 'Align left' });
    left.focus();
    fireEvent.keyDown(left, { key: 'ArrowRight' });
    const center = alignment.getByRole('radio', { name: 'Align center' });
    expect(document.activeElement).toBe(center);
    expect(center.getAttribute('aria-checked')).toBe('true');
    expect(alignment.getAllByRole('radio').filter((radio) => radio.getAttribute('tabindex') === '0')).toHaveLength(1);
    expect(store.getState().document?.root[0]?.style?.[0]?.declarations['text-align']).toBe('center');
  });

  it('selects a responsive viewport per row, indicates the override and resets it', async () => {
    const { store } = await mount('blixis/heading', { tab: 'style' });
    fireEvent.click(screen.getByRole('button', { name: 'Select Tablet styles for Size' }));
    expect(screen.getByText('Tablet styles')).toBeTruthy();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Size' }), { target: { value: '24' } });
    expect(store.getState().document?.root[0]?.style?.[0]).toMatchObject({
      breakpoint: 'tablet',
      declarations: { 'font-size': '24px' },
    });
    expect(screen.getByText(/Overridden at this breakpoint/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reset Size to inherited' }));
    expect(store.getState().document?.root[0]?.style).toBeUndefined();
  });

  it.each(['blixis/section', 'blixis/container', 'blixis/heading', 'blixis/text', 'blixis/image', 'blixis/button'])(
    'renders all supported Style sections for %s and keeps disabled gradient placeholder',
    async (type) => {
      const { container } = await mount(type, { tab: 'style' });
      expect(screen.getByRole('button', { name: 'Toggle Typography' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Toggle Color' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Toggle Box model' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Toggle Layout' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Toggle Border & Effects' })).toBeTruthy();
      const gradient = screen.getByRole('checkbox', { name: 'Gradient' });
      expect(gradient.hasAttribute('disabled')).toBe(true);
      expect(gradient.getAttribute('aria-disabled')).toBe('true');
      expect(await axeViolations(container)).toEqual([]);
    },
  );

  it('keeps selection, style slider and box model typing responsive in a 5,000 element document', async () => {
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
          <ReactiveInspector tab="style" editable />
        </I18nProvider>
      </StoreProvider>,
    );
    act(() => {
      expect(store.getState().select(selected.id)).toBe(true);
    });
    const slider = screen.getByRole('slider', { name: 'Size' });
    vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      right: 100,
      top: 0,
      bottom: 20,
      width: 100,
      height: 20,
      toJSON: () => ({}),
    });
    fireEvent.pointerDown(slider, { pointerId: 1, clientX: 20 });
    fireEvent.pointerMove(slider, { pointerId: 1, clientX: 70 });
    fireEvent.pointerUp(slider, { pointerId: 1, clientX: 80 });
    expect(store.getState().document?.root.at(-1)?.style?.[0]?.declarations['font-size']).toBeTruthy();
    const padding = screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Padding Top' });
    fireEvent.focus(padding);
    fireEvent.change(padding, { target: { value: '14' } });
    expect(store.getState().document?.root.at(-1)?.style?.[0]?.declarations['padding-block-start']).toBe('14px');
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
