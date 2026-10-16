export type ShortcutAction = 'undo' | 'redo' | 'save' | 'bold' | 'italic' | 'underline';
export type ShortcutChord = readonly string[];

export const SHORTCUTS: Record<ShortcutAction, { mac: ShortcutChord; other: ShortcutChord }> = {
  undo: { mac: ['⌘', 'Z'], other: ['Ctrl', 'Z'] },
  redo: { mac: ['⇧', '⌘', 'Z'], other: ['Ctrl', 'Shift', 'Z'] },
  save: { mac: ['⌘', 'S'], other: ['Ctrl', 'S'] },
  bold: { mac: ['⌘', 'B'], other: ['Ctrl', 'B'] },
  italic: { mac: ['⌘', 'I'], other: ['Ctrl', 'I'] },
  underline: { mac: ['⌘', 'U'], other: ['Ctrl', 'U'] },
};

export function shortcutKeys(action: ShortcutAction, platform: string): ShortcutChord {
  return SHORTCUTS[action][/mac|iphone|ipad/i.test(platform) ? 'mac' : 'other'];
}
