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
  height: 'Height',
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
    richValue?: boolean;
    formatSession?: boolean;
    selectedText?: { text: string; marks?: Record<string, unknown> };
    sendEditCommand?: (name: string, args?: Record<string, unknown>) => void;
    startEdit?: (id: string, prop: string) => void;
  } = {},
) {
  const target = el('target', type);
  if (options.style) target.style = options.style;
  const { store } = await makeLoadedStore({
    document: makeDocument({
      root: [target],
      locales: ['en_US', 'fr_FR'],
      translations: {
        en_US: {
          target: {
            values: {
              text: options.richValue
                ? {
                    v: 1,
                    inline: [
                      { t: 'text', s: 'Rich ', m: ['strong'] },
                      { t: 'text', s: 'text' },
                    ],
                  }
                : 'Source',
            },
            status: 'translated',
          },
        },
        fr_FR: {},
      },
    }),
  });
  store.getState().setContentLocale(options.locale ?? 'en_US');
  const node = store.getState().document?.root[0] ?? null;
  const view = render(
    <StoreProvider store={store}>
      <I18nProvider editorLocale={options.editorLocale ?? 'en_US'}>
        <div className="blx-editor" data-editor-theme={options.chromeTheme ?? 'light'}>
          {options.reactive === false ? (
            <Inspector
              element={node}
              tab={options.tab ?? 'content'}
              editingEnabled={options.editable ?? true}
              editTarget={
                options.selectedText || options.formatSession ? { id: 'target', prop: 'text', status: 'ready' } : null
              }
              editSelection={
                options.selectedText || options.formatSession
                  ? {
                      id: 'target',
                      empty: !options.selectedText,
                      text: options.selectedText?.text ?? '',
                      marks: options.selectedText?.marks ?? {},
                    }
                  : null
              }
              {...(options.sendEditCommand ? { sendEditCommand: options.sendEditCommand } : {})}
              {...(options.startEdit ? { startEdit: options.startEdit } : {})}
            />
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
  const selectedOptions = (sendEditCommand: (name: string, args?: Record<string, unknown>) => void) => ({
    reactive: false,
    selectedText: { text: 'Selected words' },
    sendEditCommand,
  });

  it('disables text formatting outside an edit session and describes the controls with the translated hint', async () => {
    await mount();
    const button = within(screen.getByRole('group', { name: 'Text Formatting' })).getByRole('button', { name: 'Bold' });
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.getAttribute('aria-describedby')).toBe('inspector-text-formatting-hint');
    expect(screen.getByText('Double-click the text in the canvas to edit it')).toBeTruthy();
  });

  it('enables text formatting only for a ready edit session', async () => {
    await mount('blixis/heading', { reactive: false, formatSession: true });
    expect(
      within(screen.getByRole('group', { name: 'Text Formatting' }))
        .getByRole('button', { name: 'Bold' })
        .hasAttribute('disabled'),
    ).toBe(false);
    expect(screen.getByText('Double-click the text in the canvas to edit it')).toBeTruthy();
  });

  it.each([
    ['Bold', 'bold'],
    ['Italic', 'italic'],
    ['Underline', 'underline'],
  ] as const)('sends the exact Text Formatting %s command', async (label, mark) => {
    const command = vi.fn();
    await mount('blixis/heading', { reactive: false, formatSession: true, sendEditCommand: command });
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Text Formatting' })).getByRole('button', { name: label }),
    );
    expect(command).toHaveBeenCalledWith('toggle-mark', { mark });
  });

  it.each([
    ['Bold', { strong: true }],
    ['Italic', { em: true }],
    ['Underline', { u: true }],
  ] as const)('sets aria-pressed for %s from canvas edit-selection marks', async (label, marks) => {
    await mount('blixis/heading', { reactive: false, selectedText: { text: 'Words', marks } });
    expect(
      within(screen.getByRole('group', { name: 'Text Formatting' }))
        .getByRole('button', { name: label })
        .getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('sends clear-marks from the Text Formatting clear button', async () => {
    const command = vi.fn();
    await mount('blixis/heading', { reactive: false, formatSession: true, sendEditCommand: command });
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Text Formatting' })).getByRole('button', { name: 'Clear formatting' }),
    );
    expect(command).toHaveBeenCalledWith('clear-marks');
  });

  it('prefills the link popover from active marks and applies URL and new-tab state exactly', async () => {
    const command = vi.fn();
    await mount('blixis/heading', {
      reactive: false,
      selectedText: { text: 'Words', marks: { link: { href: 'https://prefill.test', newTab: true } } },
      sendEditCommand: command,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Text Formatting link' }));
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Text Formatting link URL' }).value).toBe(
      'https://prefill.test',
    );
    expect(
      within(screen.getByRole('form', { name: 'Text Formatting link' })).getByRole<HTMLInputElement>('checkbox', {
        name: 'Open in new tab',
      }).checked,
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(command).toHaveBeenCalledWith('set-link', { href: 'https://prefill.test', newTab: true });
  });

  it.each(['javascript:alert(1)', 'data:text/html,x', 'vbscript:msgbox(1)', ''])(
    'rejects unsafe or empty Text Formatting link URL %s',
    async (url) => {
      const command = vi.fn();
      await mount('blixis/heading', { reactive: false, formatSession: true, sendEditCommand: command });
      fireEvent.click(screen.getByRole('button', { name: 'Text Formatting link' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Text Formatting link URL' }), { target: { value: url } });
      fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
      expect(screen.getByRole('alert').textContent).toBe(
        'Enter a safe link using http, https, mailto, tel, or a relative address.',
      );
      expect(command).not.toHaveBeenCalled();
    },
  );

  it('rejects Text Formatting link URLs longer than 2048 characters', async () => {
    const command = vi.fn();
    await mount('blixis/heading', { reactive: false, formatSession: true, sendEditCommand: command });
    fireEvent.click(screen.getByRole('button', { name: 'Text Formatting link' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Text Formatting link URL' }), {
      target: { value: `https://${'a'.repeat(2041)}` },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(command).not.toHaveBeenCalled();
  });

  it.each(['https://example.test/path', 'mailto:hello@example.test', 'tel:+12025550123', '/relative/path'])(
    'accepts safe Text Formatting link URL %s',
    async (url) => {
      const command = vi.fn();
      await mount('blixis/heading', { reactive: false, formatSession: true, sendEditCommand: command });
      fireEvent.click(screen.getByRole('button', { name: 'Text Formatting link' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Text Formatting link URL' }), { target: { value: url } });
      fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
      expect(command).toHaveBeenCalledWith('set-link', { href: url, newTab: false });
    },
  );

  it('removes an existing link from the popover', async () => {
    const command = vi.fn();
    await mount('blixis/heading', {
      reactive: false,
      selectedText: { text: 'Words', marks: { link: { href: 'https://existing.test' } } },
      sendEditCommand: command,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Text Formatting link' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(command).toHaveBeenCalledWith('clear-link');
  });

  it('keeps Text Formatting link naming distinct from toolbar and Selected Text fields', async () => {
    await mount('blixis/heading', { reactive: false, selectedText: { text: 'Words' } });
    expect(screen.getByRole('button', { name: 'Text Formatting link' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Selected text link URL' })).toBeTruthy();
  });

  it.each(['en_US', 'nl_NL'] as const)('translates Text Formatting in %s', async (editorLocale) => {
    await mount('blixis/heading', { reactive: false, editorLocale });
    expect(
      screen.getByRole('heading', { name: editorLocale === 'en_US' ? 'Text Formatting' : 'Tekstopmaak' }),
    ).toBeTruthy();
  });

  it.each(['light', 'dark'] as const)(
    'keeps the Text Formatting section axe clean in %s chrome',
    async (chromeTheme) => {
      await mount('blixis/heading', { reactive: false, chromeTheme });
      expect(await axeViolations(document.body)).toEqual([]);
    },
  );

  it('keeps Selected Text controls inside labeled shared inspector rows', async () => {
    const { container } = await mount('blixis/heading', {
      reactive: false,
      selectedText: { text: 'Selected text' },
    });
    const panel = container.querySelector('#inspector-section-selected-text-panel');
    expect(panel).toBeTruthy();
    for (const id of [
      'rich-apply-to',
      'rich-color',
      'rich-highlight',
      'rich-weight',
      'rich-link',
      'rich-inline-style',
    ]) {
      const control = panel?.querySelector(`#${id}`);
      expect(control?.closest('.blx-inspector-field')).toBeTruthy();
      expect(control?.closest('.blx-inspector-field')?.querySelector('label')).toBeTruthy();
    }
    for (const groupName of ['Font weight', 'Text style']) {
      const group = within(panel as HTMLElement).getByRole('group', { name: groupName });
      expect(group.closest('.blx-inspector-field')?.querySelector('.blx-selected-field-label')).toBeTruthy();
    }
  });

  it('keeps Content Text Formatting controls within the shared inspector row', async () => {
    const { container } = await mount('blixis/heading');
    const panel = container.querySelector('#inspector-section-text-formatting-panel');
    const group = panel?.querySelector('.blx-text-formatting-controls');
    expect(group?.closest('.blx-inspector-field')).toBeTruthy();
    expect(group?.querySelectorAll('button')).toHaveLength(5);
    expect(panel?.querySelector('.blx-inspector-hint')).toBeTruthy();
  });

  it('shows rich values as read-only plain text and starts their canvas edit session', async () => {
    const startEdit = vi.fn();
    await mount('blixis/heading', { richValue: true, reactive: false, startEdit });
    const field = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Text' });
    expect(field.value).toBe('Rich text');
    expect(field.readOnly).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Edit text in canvas' }));
    expect(startEdit).toHaveBeenCalledWith('target', 'text');
  });

  it.each([
    ['Normal', null],
    ['Medium', 'medium'],
    ['Bold', 'bold'],
  ] as const)('sends the exact weight select command for %s', async (label, weight) => {
    const command = vi.fn();
    await mount('blixis/heading', selectedOptions(command));
    fireEvent.change(screen.getByRole('combobox', { name: 'Font weight' }), {
      target: { value: label.toLowerCase() },
    });
    expect(command).toHaveBeenCalledWith('set-style', { weight });
  });

  it.each([
    ['Normal', null],
    ['Medium', 'medium'],
    ['Bold', 'bold'],
  ] as const)('sends the exact segmented weight command for %s', async (label, weight) => {
    const command = vi.fn();
    await mount('blixis/heading', selectedOptions(command));
    fireEvent.click(within(screen.getByRole('group', { name: 'Font weight' })).getByRole('button', { name: label }));
    expect(command).toHaveBeenCalledWith('set-style', { weight });
  });

  it('binds the weight select and segmented buttons to the current mark value', async () => {
    await mount('blixis/heading', {
      reactive: false,
      selectedText: { text: 'Selected words', marks: { style: { weight: 'medium' } } },
      sendEditCommand: vi.fn(),
    });
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Font weight' }).value).toBe('medium');
    expect(screen.getByRole('button', { name: 'Medium' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Normal' }).getAttribute('aria-pressed')).toBe('false');
  });

  it.each([
    ['Italic', 'italic'],
    ['Underline', 'underline'],
    ['Strikethrough', 'strike'],
  ] as const)('dispatches the %s mark toggle exactly and reports pressed state', async (label, mark) => {
    const command = vi.fn();
    await mount('blixis/heading', selectedOptions(command));
    const button = within(screen.getByRole('group', { name: 'Text style' })).getByRole('button', { name: label });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(button);
    expect(command).toHaveBeenCalledWith('toggle-mark', { mark });
  });

  it('shows pressed text-style buttons from the live selection marks', async () => {
    await mount('blixis/heading', {
      reactive: false,
      selectedText: { text: 'Selected words', marks: { em: true, u: true, s: true } },
      sendEditCommand: vi.fn(),
    });
    for (const label of ['Italic', 'Underline', 'Strikethrough']) {
      expect(
        within(screen.getByRole('group', { name: 'Text style' }))
          .getByRole('button', { name: label })
          .getAttribute('aria-pressed'),
      ).toBe('true');
    }
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,x',
    'vbscript:msgbox(1)',
    '',
    'x'.repeat(2049),
    'https://safe.test/\u0001path',
  ])('rejects selected text link draft %s with described alert', async (href) => {
    const command = vi.fn();
    await mount('blixis/heading', selectedOptions(command));
    const url = screen.getByRole('textbox', { name: 'Selected text link URL' });
    fireEvent.change(url, { target: { value: href } });
    if (!href) {
      fireEvent.click(screen.getByRole('switch', { name: 'Link' }));
      fireEvent.blur(url);
    } else fireEvent.blur(url);
    expect(screen.getByRole('alert').getAttribute('id')).toBe(url.getAttribute('aria-describedby'));
    expect(command).not.toHaveBeenCalledWith('set-link', expect.anything());
    expect((url as HTMLInputElement).value).toBe(href);
  });

  it.each(['https://safe.test/', 'http://safe.test/', 'mailto:hello@safe.test', 'tel:+31201234567', '/relative/path'])(
    'accepts selected text link URL %s',
    async (href) => {
      const command = vi.fn();
      await mount('blixis/heading', selectedOptions(command));
      const url = screen.getByRole('textbox', { name: 'Selected text link URL' });
      fireEvent.change(url, { target: { value: href } });
      fireEvent.blur(url);
      expect(command).toHaveBeenCalledWith('set-link', { href, newTab: false });
    },
  );

  it('prefills a selected text link and new-tab state, then removes it', async () => {
    const command = vi.fn();
    await mount('blixis/heading', {
      ...selectedOptions(command),
      selectedText: { text: 'Selected words', marks: { link: { href: 'https://safe.test', target: '_blank' } } },
    });
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Selected text link URL' }).value).toBe(
      'https://safe.test',
    );
    expect(screen.getByRole<HTMLInputElement>('switch', { name: 'Link' }).checked).toBe(true);
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Open in new tab' }).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Clear link' }));
    expect(command).toHaveBeenCalledWith('clear-link', undefined);
  });

  it('sets a selected text link with newTab enabled', async () => {
    const command = vi.fn();
    await mount('blixis/heading', selectedOptions(command));
    const url = screen.getByRole('textbox', { name: 'Selected text link URL' });
    fireEvent.change(url, { target: { value: 'https://safe.test' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Open in new tab' }));
    expect(command).toHaveBeenCalledWith('set-link', { href: 'https://safe.test', newTab: true });
  });

  it.each([
    ['Span', 'span'],
    ['Code', 'code'],
  ] as const)('selects inline style %s', async (label, value) => {
    const command = vi.fn();
    await mount('blixis/heading', selectedOptions(command));
    fireEvent.change(screen.getByRole('combobox', { name: 'Inline style' }), { target: { value } });
    if (value === 'code') expect(command).toHaveBeenCalledWith('toggle-mark', { mark: 'code' });
    else expect(command).not.toHaveBeenCalled();
    expect(screen.getByRole('option', { name: label }).getAttribute('value')).toBe(value);
  });

  it('wraps weight, marks, and links for Apply to whole element', async () => {
    const command = vi.fn();
    await mount('blixis/heading', selectedOptions(command));
    fireEvent.change(screen.getByRole('combobox', { name: 'Apply to' }), { target: { value: 'whole' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Font weight' }), { target: { value: 'bold' } });
    expect(command).toHaveBeenCalledWith('apply-to-all', { name: 'set-style', args: { weight: 'bold' } });
    fireEvent.click(within(screen.getByRole('group', { name: 'Text style' })).getByRole('button', { name: 'Italic' }));
    expect(command).toHaveBeenCalledWith('apply-to-all', { name: 'toggle-mark', args: { mark: 'italic' } });
    const url = screen.getByRole('textbox', { name: 'Selected text link URL' });
    fireEvent.change(url, { target: { value: 'https://safe.test' } });
    fireEvent.blur(url);
    expect(command).toHaveBeenCalledWith('apply-to-all', {
      name: 'set-link',
      args: { href: 'https://safe.test', newTab: false },
    });
  });

  it.each([
    ['Text color', 'color-primary', { color: 'color-primary' }],
    ['Background highlight', 'color-surface', { highlight: 'color-surface' }],
    ['Text color', '', { color: null }],
    ['Background highlight', '', { highlight: null }],
  ] as const)('dispatches the selected text %s token change exactly', async (label, value, args) => {
    const command = vi.fn();
    await mount('blixis/heading', selectedOptions(command));
    fireEvent.change(screen.getByRole('combobox', { name: label }), { target: { value } });
    expect(command).toHaveBeenCalledWith('set-style', args);
  });

  it('wraps the selected text token change for Apply to whole element', async () => {
    const command = vi.fn();
    await mount('blixis/heading', selectedOptions(command));
    fireEvent.change(screen.getByRole('combobox', { name: 'Apply to' }), { target: { value: 'whole' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Background highlight' }), {
      target: { value: 'color-surface' },
    });
    expect(command).toHaveBeenCalledWith('apply-to-all', {
      name: 'set-style',
      args: { highlight: 'color-surface' },
    });
  });

  it.each(['en_US', 'nl_NL'] as const)('translates selected text controls in %s', async (editorLocale) => {
    await mount('blixis/heading', {
      ...selectedOptions(vi.fn()),
      editorLocale,
    });
    const labels =
      editorLocale === 'en_US'
        ? [
            'Font weight',
            'Inline style',
            'Select any part of a text element directly in the canvas to style it differently.',
          ]
        : ['Tekstgewicht', 'Inline stijl', 'Selecteer tekst rechtstreeks in het canvas om die anders op te maken.'];
    for (const label of labels) expect(document.body.textContent).toContain(label);
    expect(
      screen.getByRole('textbox', {
        name: editorLocale === 'en_US' ? 'Selected text link URL' : 'URL voor geselecteerde tekstlink',
      }),
    ).toBeTruthy();
  });

  it.each(['width', 'height'] as const)('%s custom input is shown only while Custom is selected', async (property) => {
    await mount('blixis/heading', { tab: 'style' });
    const select = screen.getByRole<HTMLSelectElement>('combobox', { name: property === 'width' ? 'Width' : 'Height' });
    expect(document.getElementById(`style-target-${property}-custom`)).toBeNull();
    fireEvent.change(select, { target: { value: 'custom' } });
    expect(document.getElementById(`style-target-${property}-custom`)).toBeTruthy();
    fireEvent.change(select, { target: { value: 'auto' } });
    expect(document.getElementById(`style-target-${property}-custom`)).toBeNull();
  });

  it.each([
    ['width', '736px'],
    ['height', '184px'],
    ['width', '2.5rem'],
    ['height', '45%'],
  ] as const)('shows the active rule value and unit after resize style command: %s=%s', async (property, size) => {
    const { store } = await mount('blixis/heading', { tab: 'style' });
    const selector = { breakpoint: 'mobile' };
    act(() => {
      store.getState().setViewport('mobile');
      store.getState().dispatch({ type: 'set-style-rule', id: 'target', selector, declarations: { [property]: size } });
    });
    const field = screen.getByRole<HTMLInputElement>('spinbutton', {
      name: property === 'width' ? 'Custom width' : 'Custom height',
    });
    const unit = /[a-z%]+$/i.exec(size)?.[0] ?? '';
    expect(field.value).toBe(size.slice(0, -unit.length));
    expect(
      screen.getByRole<HTMLSelectElement>('combobox', {
        name: `${property === 'width' ? 'Custom width' : 'Custom height'} unit`,
      }).value,
    ).toBe(unit);
  });

  it.each(['width', 'height'] as const)('edits %s at the active responsive breakpoint', async (property) => {
    const { store } = await mount('blixis/heading', { tab: 'style' });
    act(() => {
      store.getState().setViewport('tablet');
    });
    fireEvent.change(screen.getByRole('combobox', { name: property === 'width' ? 'Width' : 'Height' }), {
      target: { value: 'custom' },
    });
    fireEvent.change(
      screen.getByRole('spinbutton', { name: property === 'width' ? 'Custom width' : 'Custom height' }),
      {
        target: { value: '432' },
      },
    );
    expect(store.getState().document?.root[0]?.style).toContainEqual({
      breakpoint: 'tablet',
      declarations: { [property]: '432px' },
    });
  });

  it.each(['width', 'height'] as const)('converts %s when its unit changes', async (property) => {
    const { store } = await mount('blixis/heading', {
      tab: 'style',
      style: [{ declarations: { [property]: '32px' } }],
    });
    fireEvent.change(screen.getByRole('combobox', { name: property === 'width' ? 'Width' : 'Height' }), {
      target: { value: 'custom' },
    });
    fireEvent.change(
      screen.getByRole('combobox', { name: `${property === 'width' ? 'Custom width' : 'Custom height'} unit` }),
      {
        target: { value: 'rem' },
      },
    );
    expect(store.getState().document?.root[0]?.style?.[0]?.declarations[property]).toBe('2rem');
  });

  it('keeps an invalid custom dimension draft and announces validation', async () => {
    await mount('blixis/heading', { tab: 'style' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Width' }), { target: { value: 'custom' } });
    const field = screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Custom width' });
    fireEvent.change(field, { target: { value: '6000' } });
    expect(field.value).toBe('6000');
    expect(screen.getByRole('alert').textContent).toBe('This value does not meet the requirements for this field.');
  });

  it.each([
    ['en_US', 'Width', 'Height', 'Custom width', 'Custom height'],
    ['nl_NL', 'Breedte', 'Hoogte', 'Aangepaste breedte', 'Aangepaste hoogte'],
  ] as const)(
    'labels both custom dimensions in %s',
    async (editorLocale, widthSelect, heightSelect, widthLabel, heightLabel) => {
      await mount('blixis/heading', { tab: 'style', editorLocale });
      for (const [property, label] of [
        ['width', widthLabel],
        ['height', heightLabel],
      ] as const) {
        fireEvent.change(screen.getByRole('combobox', { name: property === 'width' ? widthSelect : heightSelect }), {
          target: { value: 'custom' },
        });
        expect(screen.getByRole('spinbutton', { name: label })).toBeTruthy();
      }
    },
  );

  it('has no axe violations with custom dimensions visible and supports RTL direction inheritance', async () => {
    const { container } = await mount('blixis/heading', { tab: 'style', editorLocale: 'nl_NL' });
    container.setAttribute('dir', 'rtl');
    fireEvent.change(screen.getByRole('combobox', { name: 'Breedte' }), { target: { value: 'custom' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Hoogte' }), { target: { value: 'custom' } });
    expect(await axeViolations(container)).toEqual([]);
    expect(container.querySelector('#style-target-width-custom')?.closest('[dir="rtl"]')).toBe(container);
  });

  it('coalesces a burst of custom width typing into one undo step', async () => {
    const { store } = await mount('blixis/heading', { tab: 'style' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Width' }), { target: { value: 'custom' } });
    const field = screen.getByRole('spinbutton', { name: 'Custom width' });
    fireEvent.change(field, { target: { value: '7' } });
    fireEvent.change(field, { target: { value: '73' } });
    fireEvent.change(field, { target: { value: '736' } });
    act(() => {
      store.getState().undo();
    });
    expect(store.getState().document?.root[0]?.style).toBeUndefined();
  });

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

  it.each(['light', 'dark'] as const)(
    'keeps the Selected Text inspector axe clean in %s chrome',
    async (chromeTheme) => {
      const { container } = await mount('blixis/heading', {
        reactive: false,
        chromeTheme,
        selectedText: { text: 'Selected text', marks: { strong: true, em: true } },
      });
      const section = screen.getByRole('region', { name: chromeTheme === 'light' ? 'Selected Text' : 'Selected Text' });
      expect(await axeViolations(section)).toEqual([]);
      expect(container.querySelector('.blx-format-preview strong em')?.textContent).toBe('Selected text');
    },
    15_000,
  );

  it('collapses a section with a real button, exposes its region, and remembers state for the session', async () => {
    const user = userEvent.setup();
    const first = await mount('blixis/heading');
    const toggle = screen.getByRole('button', { name: 'Toggle Heading' });
    const panelId = toggle.getAttribute('aria-controls');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    toggle.focus();
    await user.keyboard(' ');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    const panel = panelId ? document.getElementById(panelId) : null;
    expect(panel?.hasAttribute('inert')).toBe(true);
    expect(panel?.getAttribute('aria-hidden')).toBe('true');
    if (panel) fireEvent.transitionEnd(panel);
    expect(panel?.hasAttribute('hidden')).toBe(true);
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

  it('keeps future-only inspector placeholders disabled and exposes the inline editing preference', async () => {
    await mount('blixis/heading');
    for (const label of ['Static Content', 'Translation']) {
      const control = screen.getByRole(label === 'Static Content' ? 'combobox' : 'checkbox', { name: label });
      expect(control.getAttribute('aria-disabled')).toBe('true');
      expect(control.getAttribute('aria-describedby')).toBeTruthy();
      expect(control.hasAttribute('disabled')).toBe(true);
    }
    expect(screen.getByText(/BWB-084/)).toBeTruthy();
    expect(screen.getByText(/BWB-114/)).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Inline Editing' }).getAttribute('aria-checked')).toBe('true');
  });

  it('renders text and textarea schema controls', async () => {
    await mount('blixis/text');
    expect(screen.getByRole('textbox', { name: 'Text' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Text' }).tagName).toBe('TEXTAREA');
  });

  it('shows rich text as read-only plain text and does not dispatch edits', async () => {
    const { store } = await mount('blixis/heading', { richValue: true });
    const field = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Text' });
    expect(field.value).toBe('Rich text');
    expect(field.readOnly).toBe(true);
    expect(screen.getByText('Edit rich text directly in the canvas.')).toBeTruthy();
    const before = store.getState().document;
    fireEvent.change(field, { target: { value: 'replacement' } });
    expect(store.getState().document).toEqual(before);
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
        height: '120',
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
      } else if (property === 'height') {
        fireEvent.change(screen.getByRole('combobox', { name: label }), { target: { value: 'custom' } });
        fireEvent.change(screen.getByRole('spinbutton', { name: 'Custom height' }), { target: { value: next } });
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
        property === 'height' ||
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
