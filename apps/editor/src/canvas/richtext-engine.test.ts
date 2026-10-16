import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountRichText, selectionMarks } from './richtext-engine';

// jsdom has no layout: ProseMirror scrolls the caret into view after a focus and needs these measuring APIs.
const noRects = (): DOMRectList => [] as unknown as DOMRectList;
Element.prototype.getClientRects = noRects;
Range.prototype.getClientRects = noRects;
Range.prototype.getBoundingClientRect = (): DOMRect => new DOMRect();

describe('lazy canvas rich text engine', () => {
  const mounts: { destroy: () => void }[] = [];
  afterEach(() => {
    mounts.splice(0).forEach((item) => {
      item.destroy();
    });
    document.body.replaceChildren();
  });
  const mount = (value: unknown = 'Hello', multiline = true) => {
    const el = document.createElement('h2');
    el.setAttribute('data-blx-id', 'el-heading-1');
    el.textContent = typeof value === 'string' ? value : '';
    document.body.append(el);
    const onChange = vi.fn();
    const onEnd = vi.fn();
    const onSelection = vi.fn();
    const result = mountRichText(el, value, { multiline, onChange, onEnd, onSelection });
    mounts.push(result);
    return { el, ...result, onChange, onEnd, onSelection };
  };
  it('mounts a contenteditable root and restores the preview DOM on teardown', () => {
    const instance = mount();
    const { el, editor } = instance;
    expect(el.querySelector('[contenteditable="true"]')).not.toBeNull();
    instance.destroy();
    expect(el.textContent).toBe('Hello');
    expect(editor.isDestroyed).toBe(true);
  });
  it('puts the caret in the editor on mount so typing and Escape reach it', async () => {
    const { el } = mount();
    const root = el.querySelector('[contenteditable="true"]');
    expect(root).not.toBeNull();
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(root);
    });
  });
  it('places an optional caret at the bounded plain-text offset', () => {
    const el = document.createElement('h2');
    el.textContent = 'Hello';
    document.body.append(el);
    const result = mountRichText(el, 'Hello', {
      multiline: false,
      caret: 2,
      onChange: vi.fn(),
      onEnd: vi.fn(),
      onSelection: vi.fn(),
    });
    mounts.push(result);
    expect(result.editor.state.selection.from).toBe(3);
    expect(result.editor.state.selection.to).toBe(3);
  });
  it('re-sends the selection state after a mark toggle so pressed states stay current', () => {
    const el = document.createElement('h2');
    el.setAttribute('data-blx-id', 'el-heading-1');
    el.textContent = 'Hello';
    document.body.append(el);
    const onSelection = vi.fn();
    const result = mountRichText(el, 'Hello', { multiline: true, onChange: vi.fn(), onEnd: vi.fn(), onSelection });
    mounts.push(result);
    result.editor.commands.selectAll();
    onSelection.mockClear();
    result.editor.commands.toggleBold();
    expect(onSelection).toHaveBeenCalled();
    expect((onSelection.mock.lastCall?.[0] as { marks: Record<string, unknown> }).marks['strong']).toBe(true);
  });
  it('reports active marks only in the shape the protocol validator accepts (no nulls, no raw link attributes)', () => {
    const { editor, onSelection } = mount('Hello');
    editor.commands.selectAll();
    editor.commands.setMark('blxStyle', { color: 'color-primary' });
    editor.commands.setMark('link', { href: 'https://example.test/', target: '_blank' });
    const marks = selectionMarks(editor);
    expect(marks['style']).toEqual({ color: 'color-primary' });
    expect(marks['link']).toEqual({ href: 'https://example.test/', newTab: true });
    expect(Object.keys(marks).sort()).toEqual(['code', 'em', 'link', 'u', 's', 'strong', 'style'].sort());
    expect(onSelection.mock.calls.length).toBeGreaterThan(0);
    for (const call of onSelection.mock.calls as [{ marks: Record<string, unknown> }][]) {
      const style = call[0].marks['style'] as Record<string, unknown> | undefined;
      expect(Object.values(style ?? {}).every((value) => typeof value === 'string')).toBe(true);
    }
  });
  it('serializes mark changes as rich model values', () => {
    const { editor, onChange } = mount();
    editor.commands.selectAll();
    editor.commands.toggleBold();
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.lastCall?.[0]).toEqual({ v: 1, inline: [{ t: 'text', s: 'Hello', m: ['strong'] }] });
  });
  it('applies a whole-element mark while restoring the selected word in real Tiptap', () => {
    const { editor } = mount('Hello world');
    editor.commands.setTextSelection({ from: 1, to: 6 });
    const previous = editor.state.selection;
    editor.commands.selectAll();
    editor.commands.toggleBold();
    editor.commands.setTextSelection({ from: previous.from, to: previous.to });
    expect(editor.getJSON().content[0]?.content?.[0]?.marks).toContainEqual({ type: 'bold' });
    expect(editor.state.selection.from).toBe(previous.from);
    expect(editor.state.selection.to).toBe(previous.to);
  });
  it('reports the DOM range bounding box for a selection instead of the shorter caret box', () => {
    const rangeRect = new DOMRect(31, 42, 173, 36);
    const rangeSpy = vi.spyOn(Range.prototype, 'getBoundingClientRect').mockReturnValue(rangeRect);
    const { editor, onSelection } = mount();
    editor.commands.selectAll();
    expect(onSelection.mock.lastCall?.[0]).toMatchObject({ rect: { x: 31, y: 42, w: 173, h: 36 } });
    rangeSpy.mockRestore();
  });
  it('inserts text through the actual ProseMirror editor', () => {
    const { editor, onChange } = mount();
    editor.commands.selectTextblockEnd();
    editor.commands.insertContent(' world');
    expect(onChange.mock.lastCall?.[0]).toBe('Hello world');
  });
  it('Escape requests cancellation', () => {
    const { el, onEnd } = mount();
    el.querySelector('[contenteditable]')?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(onEnd).toHaveBeenCalledWith('cancel');
  });
  it('uses a paragraph only and refuses HTML paste and drop', () => {
    const { editor } = mount();
    expect(editor.options.editorProps.transformPastedHTML?.('<img src=x onerror=1>', editor.view)).toBe('');
    expect(
      editor.options.editorProps.handleDrop?.(editor.view, new Event('drop') as DragEvent, null as never, false),
    ).toBe(true);
  });
});
