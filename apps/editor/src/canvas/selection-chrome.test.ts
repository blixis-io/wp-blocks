import { describe, expect, it } from 'vitest';
import { placeSelectionToolbar } from './selection-chrome';

describe('selection toolbar placement', () => {
  const frame = { left: 100, top: 100, width: 500, height: 400 };
  it.each(Array.from({ length: 16 }, (_, index) => ({ left: 120 + index * 17, top: 180, width: 40, height: 30 })))(
    'places toolbar above a selection when space exists (%#)',
    (selection) => {
      const result = placeSelectionToolbar(frame, selection, { width: 120, height: 32 });
      expect(result.top).toBe(selection.top - 40);
      expect(result.left).toBeGreaterThanOrEqual(frame.left);
      expect(result.left + 120).toBeLessThanOrEqual(frame.left + frame.width);
    },
  );
  it.each(Array.from({ length: 8 }, (_, index) => ({ left: 130 + index * 39, top: 104, width: 20, height: 15 })))(
    'flips below near the top edge (%#)',
    (selection) => {
      const result = placeSelectionToolbar(frame, selection, { width: 100, height: 30 });
      expect(result.top).toBe(selection.top + selection.height + 8);
    },
  );
  it.each(Array.from({ length: 8 }, (_, index) => ({ left: 560 + index * 10, top: 180, width: 20, height: 15 })))(
    'clamps to the inline end inside the frame (%#)',
    (selection) => {
      const result = placeSelectionToolbar(frame, selection, { width: 100, height: 30 });
      expect(result.left).toBe(500);
      expect(result.left + 100).toBe(frame.left + frame.width);
    },
  );
  it('clamps oversized toolbar to frame origin', () => {
    expect(
      placeSelectionToolbar(frame, { left: 590, top: 120, width: 10, height: 10 }, { width: 600, height: 500 }),
    ).toEqual({ left: 100, top: 100 });
  });
  it.each(Array.from({ length: 8 }, (_, index) => ({ left: 140 + index * 11, top: 180, width: 180, height: 24 })))(
    'aligns the toolbar to logical inline start in RTL while clamping (%#)',
    (selection) => {
      const result = placeSelectionToolbar(frame, selection, { width: 100, height: 30 }, 8, 'rtl');
      expect(result.left).toBe(selection.left + selection.width - 100);
      expect(result.left).toBeGreaterThanOrEqual(frame.left);
      expect(result.left + 100).toBeLessThanOrEqual(frame.left + frame.width);
    },
  );
});
