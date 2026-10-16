import { describe, expect, it } from 'vitest';
import { placeHoverChip, placeSelectionToolbar } from './selection-chrome';

describe('hover chip placement', () => {
  it('places the chip above and keeps it inside horizontal frame bounds', () => {
    expect(
      placeHoverChip(
        { left: 0, top: 0, width: 300, height: 200 },
        { left: 280, top: 80, width: 10, height: 20 },
        { width: 100, height: 24 },
      ),
    ).toEqual({ left: 200, top: 52 });
  });
  it('flips onto the element top edge when there is no room above', () => {
    expect(
      placeHoverChip(
        { left: 0, top: 0, width: 300, height: 200 },
        { left: 12, top: 3, width: 80, height: 20 },
        { width: 100, height: 24 },
      ),
    ).toEqual({ left: 12, top: 3 });
  });
  it('keeps the chip inside the frame when the hovered element is at the bottom edge', () => {
    expect(
      placeHoverChip(
        { left: 0, top: 0, width: 300, height: 200 },
        { left: 12, top: 198, width: 80, height: 2 },
        { width: 100, height: 24 },
      ),
    ).toEqual({ left: 12, top: 170 });
  });
});

describe('selection toolbar placement', () => {
  const frame = { left: 100, top: 100, width: 500, height: 400 };
  it.each(Array.from({ length: 40 }, (_, index) => index))(
    'maintains a six pixel clearance and stays clamped for placement case %i',
    (index) => {
      const flipped = index >= 20;
      const selection = {
        left: 120 + (index % 20) * 13,
        top: flipped ? 104 + (index % 4) : 220 + (index % 10) * 11,
        width: 48,
        height: 18,
      };
      const size = { width: 120, height: 32 };
      const result = placeSelectionToolbar(frame, selection, size, 6);
      if (flipped) expect(result.top).toBeGreaterThanOrEqual(selection.top + selection.height + 6);
      else expect(result.top + size.height).toBeLessThanOrEqual(selection.top - 6);
      expect(result.left).toBeGreaterThanOrEqual(frame.left);
      expect(result.left + size.width).toBeLessThanOrEqual(frame.left + frame.width);
      expect(result.top).toBeGreaterThanOrEqual(frame.top);
      expect(result.top + size.height).toBeLessThanOrEqual(frame.top + frame.height);
    },
  );
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
      const result = placeSelectionToolbar(frame, selection, { width: 100, height: 30 }, 6, 'rtl');
      expect(result.left).toBe(selection.left + selection.width - 100);
      expect(result.left).toBeGreaterThanOrEqual(frame.left);
      expect(result.left + 100).toBeLessThanOrEqual(frame.left + frame.width);
    },
  );
  it('keeps the requested selection gap when toolbar placement flips below', () => {
    const selection = { left: 130, top: 104, width: 20, height: 15 };
    const result = placeSelectionToolbar(frame, selection, { width: 100, height: 30 }, 6);
    expect(result.top).toBe(selection.top + selection.height + 6);
  });
});
