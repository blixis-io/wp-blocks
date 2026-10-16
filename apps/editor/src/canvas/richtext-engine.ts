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
  host: RichTextHost,
): { editor: Editor; destroy(): void } {
  const original = element.innerHTML;
  const mount = element.ownerDocument.createElement('div');
  const initialValue = host.multiline ? value : singleLineValue(value);
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
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection;
      let rect: { left: number; top: number; bottom: number } | undefined;
      try {
        rect = editor.view.coordsAtPos(from);
      } catch {
        rect = undefined;
      }
      host.onSelection({
        empty: from === to,
        text: editor.state.doc.textBetween(from, to, ' ').slice(0, 200),
        marks: {
          strong: editor.isActive('bold'),
          em: editor.isActive('italic'),
          u: editor.isActive('underline'),
          s: editor.isActive('strike'),
          code: editor.isActive('code'),
          link: editor.getAttributes('link'),
          style: editor.getAttributes('blxStyle'),
        },
        ...(rect === undefined ? {} : { rect: { x: rect.left, y: rect.top, w: 0, h: rect.bottom - rect.top } }),
      });
    },
  });
  element.replaceChildren(mount);
  // The edit starts from a double click on a non-focusable element: put the caret in the editor (and focus the canvas window),
  // otherwise key events keep going to the body and typing, shortcuts and Escape do nothing.
  element.ownerDocument.defaultView?.focus();
  editor.commands.focus('end');
  let destroyed = false;
  const onCompositionEnd = (): void => {
    setTimeout(() => {
      if (!editor.isDestroyed) host.onChange(toModel(editor.getJSON(), host.tokens));
    }, 0);
  };
  editor.view.dom.addEventListener('compositionend', onCompositionEnd);
  return {
    editor,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      editor.view.dom.removeEventListener('compositionend', onCompositionEnd);
      editor.destroy();
      element.innerHTML = original;
    },
  };
}
