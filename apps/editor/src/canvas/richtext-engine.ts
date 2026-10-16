import { Editor, Extension, Mark, type JSONContent } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import HardBreak from '@tiptap/extension-hard-break';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Underline from '@tiptap/extension-underline';
import Strike from '@tiptap/extension-strike';
import Code from '@tiptap/extension-code';
import { history, redo, undo } from '@tiptap/pm/history';
import { keymap } from '@tiptap/pm/keymap';
import { fromModel, toModel } from './richtext-mapper';
import { isSafeUrl } from '@blixis/wp-core';

const boundedCoordinate = (value: number): number =>
  Math.max(-1_000_000, Math.min(1_000_000, Number.isFinite(value) ? value : 0));
const boundedSize = (value: number): number => Math.max(0, Math.min(1_000_000, Number.isFinite(value) ? value : 0));

const Style = Mark.create({
  name: 'blxStyle',
  inclusive: false,
  addAttributes() {
    return { color: { default: null }, highlight: { default: null }, weight: { default: null } };
  },
  parseHTML() {
    return [{ tag: 'span[class]' }];
  },
  renderHTML({ HTMLAttributes }) {
    const classes = [];
    if (typeof HTMLAttributes['color'] === 'string') classes.push(`blx-mc-${HTMLAttributes['color']}`);
    if (typeof HTMLAttributes['highlight'] === 'string') classes.push(`blx-mh-${HTMLAttributes['highlight']}`);
    if (typeof HTMLAttributes['weight'] === 'string') classes.push(`blx-mw-${HTMLAttributes['weight']}`);
    return ['span', { class: classes.join(' ') }, 0];
  },
});
const SafeLink = Mark.create({
  name: 'link',
  inclusive: false,
  addAttributes() {
    return { href: { default: null }, target: { default: null } };
  },
  parseHTML() {
    return [
      {
        tag: 'a[href]',
        getAttrs: (node) => {
          const href = node.getAttribute('href') ?? '';
          return isSafeUrl(href) ? { href, target: node.getAttribute('target') } : false;
        },
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'a',
      {
        href: typeof HTMLAttributes['href'] === 'string' ? HTMLAttributes['href'] : '',
        ...(HTMLAttributes['target'] === '_blank' ? { target: '_blank' } : {}),
        rel: 'noopener noreferrer',
      },
      0,
    ];
  },
});
const SingleLine = Extension.create<{ onEnd: () => void }>({
  name: 'singleLine',
  addOptions() {
    return { onEnd: () => undefined };
  },
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        this.options.onEnd();
        return true;
      },
    };
  },
});
const EditingHistory = Extension.create({
  name: 'editingHistory',
  addProseMirrorPlugins() {
    return [history(), keymap({ 'Mod-z': undo, 'Mod-Shift-z': redo, 'Mod-y': redo })];
  },
});

export interface RichTextHost {
  onChange(value: unknown): void;
  onSelection(selection: unknown): void;
  onEnd(reason: 'commit' | 'cancel'): void;
  tokens?: ReadonlySet<string>;
  multiline: boolean;
  focus?: boolean;
}
/** Replaces only the changed plain-text range so marks outside the edit survive. */
export function replacePlainText(editor: Editor, text: string, multiline: boolean): void {
  if (editor.view.composing || text.length > 20_000) return;
  const next = text.replace(/[\r\n]+/g, multiline ? '\n' : ' ');
  const doc = editor.state.doc;
  const previous = doc.textBetween(0, doc.content.size, '\n');
  let prefix = 0;
  while (prefix < previous.length && prefix < next.length && previous[prefix] === next[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < previous.length - prefix &&
    suffix < next.length - prefix &&
    previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]
  )
    suffix++;
  const positionAt = (offset: number): number => {
    let remaining = offset;
    let result = 1;
    let found = false;
    doc.descendants((node, pos) => {
      if (found) return false;
      if (node.isText) {
        const length = node.text?.length ?? 0;
        if (remaining <= length) {
          result = pos + remaining;
          found = true;
          return false;
        }
        remaining -= length;
      } else if (node.type.name === 'hardBreak') {
        if (remaining === 0) {
          result = pos;
          found = true;
          return false;
        }
        remaining--;
      }
      return true;
    });
    return result;
  };
  const from = positionAt(prefix);
  const to = positionAt(previous.length - suffix);
  const marks = doc.resolve(Math.max(1, Math.min(from, doc.content.size - 1))).marks();
  const lines = next.slice(prefix, next.length - suffix).split('\n');
  const hardBreakNode = editor.schema.nodes['hardBreak'];
  const inserted = lines.flatMap((line, index) => [
    ...(line ? [editor.schema.text(line, marks)] : []),
    ...(index < lines.length - 1 && hardBreakNode ? [hardBreakNode.create()] : []),
  ]);
  editor.view.dispatch(editor.state.tr.replaceWith(from, to, inserted));
}
function singleLineValue(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(/[\r\n]+/g, ' ');
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const record = value as { v?: unknown; inline?: unknown };
  if (record.v !== 1 || !Array.isArray(record.inline)) return value;
  return {
    v: 1,
    inline: (record.inline as unknown[]).map((node) =>
      node && typeof node === 'object' && !Array.isArray(node) && (node as { t?: unknown }).t === 'br'
        ? { t: 'text', s: ' ' }
        : node,
    ),
  };
}
export function mountRichText(
  element: HTMLElement,
  value: unknown,
  host: RichTextHost & { caret?: number },
): { editor: Editor; setText(text: string): void; destroy(): void } {
  const original = element.innerHTML;
  const mount = element.ownerDocument.createElement('div');
  const initialValue = host.multiline ? value : singleLineValue(value);
  const emitSelection = (editor: Editor): void => {
    const { from, to } = editor.state.selection;
    let rect: { left: number; top: number; width: number; height: number } | undefined;
    try {
      const selection = editor.view.dom.ownerDocument.getSelection();
      const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      const rangeRect = range?.getBoundingClientRect();
      if (rangeRect && (rangeRect.width > 0 || rangeRect.height > 0)) rect = rangeRect;
      else {
        const caret = editor.view.coordsAtPos(from);
        rect = {
          left: caret.left,
          top: caret.top,
          width: caret.right - caret.left,
          height: caret.bottom - caret.top,
        };
      }
    } catch {
      rect = undefined;
    }
    host.onSelection({
      empty: from === to,
      text: editor.state.doc.textBetween(from, to, ' ').slice(0, 200),
      marks: selectionMarks(editor),
      ...(rect === undefined
        ? {}
        : {
            rect: {
              x: boundedCoordinate(rect.left),
              y: boundedCoordinate(rect.top),
              w: boundedSize(rect.width),
              h: boundedSize(rect.height),
            },
          }),
    });
  };
  const editor = new Editor({
    element: mount,
    // Tiptap's default base CSS is injected as an un-nonced <style>, which the canvas CSP blocks: the rules live in the runtime's nonced chrome style instead.
    injectCSS: false,
    content: fromModel(initialValue, host.tokens) as JSONContent,
    editable: true,
    extensions: [
      Document,
      Paragraph,
      Text,
      ...(host.multiline ? [HardBreak.configure({ keepMarks: false })] : []),
      Bold,
      Italic,
      Underline,
      Strike,
      Code,
      SafeLink,
      Style,
      EditingHistory,
      ...(host.multiline
        ? []
        : [
            SingleLine.configure({
              onEnd: () => {
                host.onEnd('commit');
              },
            }),
          ]),
    ],
    editorProps: {
      attributes: {
        contenteditable: 'true',
        'data-blx-richtext-root': '',
        'aria-multiline': host.multiline ? 'true' : 'false',
      },
      transformPastedHTML: () => '',
      transformPastedText: (text) => text.replace(/\r?\n/g, ' '),
      handleDrop: () => true,
      handleDOMEvents: {
        keydown: (_view, event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            host.onEnd('cancel');
            return true;
          }
          return false;
        },
      },
    },
    onUpdate: ({ editor }) => {
      if (!editor.view.composing) host.onChange(toModel(editor.getJSON(), host.tokens));
      emitSelection(editor);
    },
    onSelectionUpdate: ({ editor }) => {
      emitSelection(editor);
    },
    // Toggling a mark changes the active marks without moving the selection, so the toolbar and inspector state would go stale.
    onTransaction: ({ editor, transaction }) => {
      if (transaction.storedMarksSet) emitSelection(editor);
    },
  });
  element.replaceChildren(mount);
  // The edit starts from a double click on a non-focusable element: put the caret in the editor (and focus the canvas window),
  // otherwise key events keep going to the body and typing, shortcuts and Escape do nothing.
  if (host.focus !== false) element.ownerDocument.defaultView?.focus();
  const textLength = editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n').length;
  const caret =
    typeof host.caret === 'number' && Number.isInteger(host.caret)
      ? Math.max(0, Math.min(host.caret, textLength))
      : textLength;
  let position = 1;
  let remaining = caret;
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return true;
    const take = Math.min(remaining, node.text?.length ?? 0);
    position = pos + take;
    remaining -= take;
    return remaining > 0;
  });
  // A mirrored session (the inspector field drives it) must not touch the canvas selection or focus at all.
  if (host.focus !== false) {
    editor.commands.setTextSelection(Math.max(1, Math.min(position, editor.state.doc.content.size - 1)));
    editor.commands.focus();
  }
  let destroyed = false;
  const onCompositionEnd = (): void => {
    setTimeout(() => {
      if (!editor.isDestroyed) host.onChange(toModel(editor.getJSON(), host.tokens));
    }, 0);
  };
  editor.view.dom.addEventListener('compositionend', onCompositionEnd);
  return {
    editor,
    setText: (text) => {
      replacePlainText(editor, text, host.multiline);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      editor.view.dom.removeEventListener('compositionend', onCompositionEnd);
      editor.destroy();
      element.innerHTML = original;
    },
  };
}
/**
 * The active marks in exactly the shape the `edit-selection` message validator accepts. Tiptap reports attributes with
 * `null` members (`{ color: "x", highlight: null }`) and extra link attributes (`target`, `rel`, `class`); sending those
 * raw makes the strict validator drop EVERY later selection message, freezing the toolbar and inspector state.
 */
export function selectionMarks(editor: Editor): Record<string, unknown> {
  const marks: Record<string, unknown> = {
    strong: editor.isActive('bold'),
    em: editor.isActive('italic'),
    u: editor.isActive('underline'),
    s: editor.isActive('strike'),
    code: editor.isActive('code'),
  };
  const link = editor.getAttributes('link') as Record<string, unknown>;
  if (typeof link['href'] === 'string' && link['href'] !== '') {
    marks['link'] = { href: link['href'], ...(link['target'] === '_blank' ? { newTab: true } : {}) };
  }
  const attrs = editor.getAttributes('blxStyle') as Record<string, unknown>;
  const style: Record<string, string> = {};
  for (const key of ['color', 'highlight', 'weight']) {
    const value = attrs[key];
    if (typeof value === 'string' && value !== '') style[key] = value;
  }
  if (Object.keys(style).length > 0) marks['style'] = style;
  return marks;
}
