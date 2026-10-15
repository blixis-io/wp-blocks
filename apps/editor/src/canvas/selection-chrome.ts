export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Position a toolbar in stage coordinates, clamped to the frame and flipped below when needed. */
export function placeSelectionToolbar(
  frame: Box,
  selection: Box,
  size: { width: number; height: number },
  gap = 8,
  direction: 'ltr' | 'rtl' = 'ltr',
) {
  const inlineStart = direction === 'rtl' ? selection.left + selection.width - size.width : selection.left;
  const left = Math.max(frame.left, Math.min(inlineStart, frame.left + frame.width - size.width));
  const above = selection.top - size.height - gap;
  const top =
    above >= frame.top
      ? above
      : Math.max(frame.top, Math.min(frame.top + frame.height - size.height, selection.top + selection.height + gap));
  return { left, top };
}

export const HANDLE_POSITIONS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
