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

/** Place the decorative hover chip above the element, or on its top edge when the frame leaves no room. */
export function placeHoverChip(frame: Box, element: Box, size: { width: number; height: number }, gap = 4) {
  const left = Math.max(frame.left, Math.min(element.left, frame.left + frame.width - size.width));
  const above = element.top - size.height - gap;
  const preferredTop = above >= frame.top ? above : Math.max(frame.top, element.top);
  const top = Math.max(frame.top, Math.min(preferredTop, frame.top + frame.height - size.height));
  return { left, top };
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
}

export const HANDLE_POSITIONS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
