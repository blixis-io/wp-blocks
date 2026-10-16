import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountRichText } from './richtext-engine';

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
    const result = mountRichText(el, value, { multiline, onChange, onEnd, onSelection: vi.fn() });
    mounts.push(result);
    return { el, ...result, onChange, onEnd };
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
  it('serializes mark changes as rich model values', () => {
    const { editor, onChange } = mount();
    editor.commands.selectAll();
    editor.commands.toggleBold();
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.lastCall?.[0]).toEqual({ v: 1, inline: [{ t: 'text', s: 'Hello', m: ['strong'] }] });
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
