// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ElementNode } from '@blixis/wp-core';
import { StoreProvider, useEditorStore } from '../../state';
import { I18nProvider } from '../../i18n-react';
import { makeDocument, makeLoadedStore } from '../../test/state-helpers';
import { axeViolations } from '../../test/axe';
import { BoxModelControl } from './box-model-control';

afterEach(cleanup);

function ReactiveControl({ id }: { id: string }) {
  const element = useEditorStore((state) => {
    const visit = (nodes: NonNullable<typeof state.document>['root']): (typeof nodes)[number] | undefined => {
      for (const node of nodes) {
        if (node.id === id) return node;
        const child = visit(node.children);
        if (child) return child;
      }
      return undefined;
    };
    return state.document ? visit(state.document.root) : undefined;
  });
  const breakpoint = useEditorStore((state) => state.breakpointId);
  const breakpoints = useEditorStore((state) => state.breakpoints);
  return element ? (
    <BoxModelControl element={element} breakpoint={breakpoint} breakpoints={breakpoints} editable />
  ) : null;
}

async function setup(locale = 'en_US', theme: 'light' | 'dark' = 'light', style?: ReturnType<typeof styleFixture>) {
  const document = makeDocument();
  const elementData = document.root[0]?.children[0]?.children[0];
  if (!elementData) throw new Error('Missing fixture heading');
  if (style) elementData.style = style;
  const { store } = await makeLoadedStore({ document });
  const element = store.getState().document?.root[0]?.children[0]?.children[0];
  if (!element) throw new Error('Missing fixture element');
  const view = render(
    <StoreProvider store={store}>
      <I18nProvider editorLocale={locale}>
        <div className="blx-editor" data-editor-theme={theme}>
          <ReactiveControl id={element.id} />
        </div>
      </I18nProvider>
    </StoreProvider>,
  );
  return { store, ...view };
}
function styleFixture(): NonNullable<ElementNode['style']> {
  return [{ declarations: { 'margin-block-start': '8px', 'padding-inline-end': '4px', 'border-width': '2px' } }];
}

describe('box model inspector widget', () => {
  it('renders only capable margin, border and padding layers, without Position', async () => {
    const { container } = await setup();
    expect(within(container).getByRole('group', { name: 'CSS box model' })).toBeTruthy();
    expect(container.querySelectorAll('.blx-box-model-layer')).toHaveLength(3);
    const margin = container.querySelector('.blx-box-model-layer-margin');
    const border = margin?.querySelector('.blx-box-model-layer-border');
    const padding = border?.querySelector('.blx-box-model-layer-padding');
    expect(padding?.querySelector('.blx-box-model-content')).toBeTruthy();
    expect(container.textContent).not.toContain('Position');
  });
  it('reflects the current width and height declarations in the content box', async () => {
    const { container } = await setup('en_US', 'light', [{ declarations: { width: '240px', height: '80px' } }]);
    expect(container.querySelector('.blx-box-model-content')?.textContent).toBe('240px × 80px');
  });
  it('keeps the logical keyboard order top, end, bottom, start from outer to inner', async () => {
    await setup();
    expect(screen.getAllByRole('spinbutton').map((input) => input.getAttribute('aria-label'))).toEqual([
      'Margin Top',
      'Margin End',
      'Margin Bottom',
      'Margin Start',
      'Border width',
      'Padding Top',
      'Padding End',
      'Padding Bottom',
      'Padding Start',
    ]);
  });
  it('retains logical start/end controls in right-to-left editor chrome', async () => {
    const { container } = await setup('ar');
    const editor = container.querySelector('.blx-editor');
    editor?.setAttribute('dir', 'rtl');
    expect(screen.getByRole('spinbutton', { name: 'Margin Start' }).parentElement?.className).toContain('inline-start');
    expect(screen.getByRole('spinbutton', { name: 'Margin End' }).parentElement?.className).toContain('inline-end');
  });
  it.each(['block-start', 'inline-end', 'block-end', 'inline-start'] as const)(
    'dispatches the logical padding %s property at current breakpoint',
    async (side) => {
      const { store } = await setup();
      const input = screen.getByRole<HTMLInputElement>('spinbutton', {
        name: `Padding ${side === 'block-start' ? 'Top' : side === 'inline-end' ? 'End' : side === 'block-end' ? 'Bottom' : 'Start'}`,
      });
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: '12' } });
      expect(
        store.getState().document?.root[0]?.children[0]?.children[0]?.style?.[0]?.declarations[`padding-${side}`],
      ).toBe('12px');
    },
  );
  it('edits the shared border-width declaration from each visible side', async () => {
    const { store } = await setup();
    const border = screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Border width' });
    fireEvent.focus(border);
    fireEvent.change(border, { target: { value: '3' } });
    expect(store.getState().document?.root[0]?.children[0]?.children[0]?.style?.[0]?.declarations['border-width']).toBe(
      '3px',
    );
  });
  it('dispatches a side declaration to the selected responsive breakpoint', async () => {
    const { store } = await setup();
    act(() => {
      store.getState().setViewport('mobile');
    });
    const input = screen.getByRole('spinbutton', { name: 'Padding End' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '18' } });
    expect(store.getState().document?.root[0]?.children[0]?.children[0]?.style).toContainEqual({
      breakpoint: 'mobile',
      declarations: { 'padding-inline-end': '18px' },
    });
    expect(screen.getByText('Overridden at this breakpoint')).toBeTruthy();
  });
  it('shows inherited status through a nearer breakpoint rule with unrelated declarations', async () => {
    const { store } = await setup('en_US', 'light', [
      { declarations: { 'padding-block-start': '12px' } },
      { breakpoint: 'tablet', declarations: { color: '#123456' } },
    ]);
    act(() => {
      store.getState().setViewport('mobile');
    });
    expect(screen.getByText('Using inherited value')).toBeTruthy();
    expect(screen.getByRole('spinbutton', { name: 'Padding Top' }).getAttribute('placeholder')).toBe('—');
  });
  it('toggles linked sides and dispatches all four margin logical keys', async () => {
    const { store } = await setup();
    fireEvent.click(screen.getByRole('button', { name: 'Link Margin sides' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Margin Top' }), { target: { value: '9' } });
    const declarations = store.getState().document?.root[0]?.children[0]?.children[0]?.style?.[0]?.declarations;
    expect(
      ['block-start', 'inline-end', 'block-end', 'inline-start'].every(
        (side) => declarations?.[`margin-${side}`] === '9px',
      ),
    ).toBe(true);
  });
  it('Alt-clicks a value to link only the current edit across the layer', async () => {
    const { store } = await setup();
    const input = screen.getByRole('spinbutton', { name: 'Margin Top' });
    fireEvent.focus(input);
    fireEvent.click(input, { altKey: true });
    fireEvent.change(input, { target: { value: '7' } });
    const declarations = store.getState().document?.root[0]?.children[0]?.children[0]?.style?.[0]?.declarations;
    expect(
      ['block-start', 'inline-end', 'block-end', 'inline-start'].every(
        (side) => declarations?.[`margin-${side}`] === '7px',
      ),
    ).toBe(true);
    expect(screen.getByRole('button', { name: 'Link Margin sides' }).getAttribute('aria-pressed')).toBe('false');
  });
  it('resets one side to inherited', async () => {
    const { store } = await setup('en_US', 'light', styleFixture());
    const input = screen.getByRole('spinbutton', { name: 'Margin Top' });
    fireEvent.focus(input);
    fireEvent.click(screen.getByRole('button', { name: 'Reset Margin Top to inherited' }));
    expect(
      store.getState().document?.root[0]?.children[0]?.children[0]?.style?.[0]?.declarations['margin-block-start'],
    ).toBeUndefined();
  });
  it('supports arrow, shift, alt, enter, escape and delete reset keys', async () => {
    const { store } = await setup();
    const input = screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Padding Top' });
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(
      store.getState().document?.root[0]?.children[0]?.children[0]?.style?.[0]?.declarations['padding-block-start'],
    ).toBe('1px');
    fireEvent.keyDown(input, { key: 'ArrowUp', shiftKey: true });
    expect(
      store.getState().document?.root[0]?.children[0]?.children[0]?.style?.[0]?.declarations['padding-block-start'],
    ).toBe('11px');
    fireEvent.keyDown(input, { key: 'ArrowDown', altKey: true });
    expect(
      store.getState().document?.root[0]?.children[0]?.children[0]?.style?.[0]?.declarations['padding-block-start'],
    ).toBe('10px');
    fireEvent.change(input, { target: { value: '25' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(
      store.getState().document?.root[0]?.children[0]?.children[0]?.style?.[0]?.declarations['padding-block-start'],
    ).toBe('25px');
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(
      store.getState().document?.root[0]?.children[0]?.children[0]?.style?.[0]?.declarations['padding-block-start'],
    ).toBeUndefined();
  });
  it('uses Alt ArrowUp to step by 0.1 for rem values', async () => {
    const { store } = await setup('en_US', 'light', [{ declarations: { 'padding-block-start': '1rem' } }]);
    const input = screen.getByRole('spinbutton', { name: 'Padding Top' });
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowUp', altKey: true });
    expect(
      store.getState().document?.root[0]?.children[0]?.children[0]?.style?.[0]?.declarations['padding-block-start'],
    ).toBe('1.1rem');
  });
  it('keeps invalid drafts and exposes a translated alert', async () => {
    const { store } = await setup();
    const input = screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Padding Top' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '-1' } });
    expect(screen.getByRole('alert').textContent).toBe('This value does not meet the requirements for this field.');
    expect(input.value).toBe('-1');
    expect(store.getState().document?.root[0]?.children[0]?.children[0]?.style).toBeUndefined();
  });
  it('keeps the unit selector limited to compiler supported units', async () => {
    await setup();
    fireEvent.focus(screen.getByRole('spinbutton', { name: 'Padding Top' }));
    expect(
      within(screen.getByRole('combobox', { name: 'Padding unit' }))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['px', 'rem', 'em', '%']);
  });
  it('keeps a newly selected unit for an inherited value', async () => {
    const { store } = await setup();
    const input = screen.getByRole('spinbutton', { name: 'Padding Top' });
    fireEvent.focus(input);
    const unit = screen.getByRole('combobox', { name: 'Padding unit' });
    fireEvent.blur(input, { relatedTarget: unit });
    expect(unit.isConnected).toBe(true);
    fireEvent.change(unit, { target: { value: 'rem' } });
    fireEvent.change(input, { target: { value: '1.5' } });
    expect(
      store.getState().document?.root[0]?.children[0]?.children[0]?.style?.[0]?.declarations['padding-block-start'],
    ).toBe('1.5rem');
  });
  it('edits margin auto using the compiler keyword', async () => {
    const { store } = await setup();
    const input = screen.getByRole('spinbutton', { name: 'Margin Top' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'auto' } });
    expect(
      store.getState().document?.root[0]?.children[0]?.children[0]?.style?.[0]?.declarations['margin-block-start'],
    ).toBe('auto');
    expect(input.getAttribute('aria-valuetext')).toBe('Auto');
  });
  it('scrubs with captured pointer events and coalesces the drag burst', async () => {
    const captures = new Set<number>();
    Object.defineProperties(HTMLInputElement.prototype, {
      setPointerCapture: { configurable: true, value: (pointerId: number) => captures.add(pointerId) },
      hasPointerCapture: { configurable: true, value: (pointerId: number) => captures.has(pointerId) },
      releasePointerCapture: { configurable: true, value: (pointerId: number) => captures.delete(pointerId) },
    });
    const { store } = await setup();
    const input = screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Padding Top' });
    fireEvent.pointerDown(input, { button: 0, pointerId: 9, clientX: 10 });
    fireEvent.pointerMove(input, { pointerId: 9, clientX: 12, shiftKey: true });
    fireEvent.pointerMove(input, { pointerId: 9, clientX: 13, shiftKey: true });
    fireEvent.pointerUp(input, { pointerId: 9 });
    expect(
      store.getState().document?.root[0]?.children[0]?.children[0]?.style?.[0]?.declarations['padding-block-start'],
    ).toBe('30px');
    store.getState().undo();
    expect(store.getState().document?.root[0]?.children[0]?.children[0]?.style).toBeUndefined();
  });
  it('reports Dutch labels and aria labels', async () => {
    await setup('nl_NL');
    expect(screen.getByRole('group', { name: 'CSS-boxmodel' })).toBeTruthy();
    expect(screen.getByRole('spinbutton', { name: 'Binnenafstand Boven' })).toBeTruthy();
  });
  it.each(['light', 'dark'] as const)('passes axe in %s chrome', async (theme) => {
    const { container } = await setup('en_US', theme);
    expect(await axeViolations(container)).toEqual([]);
  });
  it('coalesces a sequence of typed values into a single undo step', async () => {
    const { store } = await setup();
    const input = screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Padding Top' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.change(input, { target: { value: '12' } });
    fireEvent.change(input, { target: { value: '123' } });
    expect(store.getState().undo()).toMatchObject({ ok: true });
    expect(store.getState().document?.root[0]?.children[0]?.children[0]?.style).toBeUndefined();
  });
});
