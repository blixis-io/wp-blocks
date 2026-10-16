import { describe, expect, it } from 'vitest';
import {
  rectAtScroll,
  resizeCssValue,
  resizeDimensions,
  resizeFromDelta,
  resizePixels,
  type ResizeHandle,
} from './resize';

describe('canvas resize geometry', () => {
  it.each([
    ['nw', true, true],
    ['n', false, true],
    ['ne', true, true],
    ['e', true, false],
    ['se', true, true],
    ['s', false, true],
    ['sw', true, true],
    ['w', true, false],
  ] as const)('%s changes only its edge dimensions', (handle, width, height) => {
    expect(resizeDimensions(handle)).toEqual({ width, height });
  });

  const handles: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  it.each(handles.flatMap((handle) => Array.from({ length: 8 }, (_, n) => [handle, n] as const)))(
    '%s geometry case %i clamps to a usable size',
    (handle, index) => {
      const result = resizeFromDelta({ x: 10, y: 20, w: 80, h: 60 }, handle, index * 3 - 12, 9 - index * 2);
      expect(result.w).toBeGreaterThanOrEqual(8);
      expect(result.h).toBeGreaterThanOrEqual(8);
      expect(Number.isFinite(result.x + result.y + result.w + result.h)).toBe(true);
    },
  );

  it('uses physical edge delta in RTL and preserves dimensions for edge handles', () => {
    expect(resizeFromDelta({ x: 0, y: 0, w: 100, h: 50 }, 'e', -20, 4, { rtl: true })).toMatchObject({ w: 120, h: 50 });
    expect(resizeFromDelta({ x: 0, y: 0, w: 100, h: 50 }, 'w', 20, 4)).toMatchObject({ w: 80, h: 50 });
  });

  it.each(Array.from({ length: 20 }, (_, index) => [index * 37, index * -19] as const))(
    'subtracts canvas scroll offset (%i, %i) from document rectangles',
    (scrollX, scrollY) => {
      expect(rectAtScroll({ x: 500, y: 320, w: 80, h: 40 }, { x: scrollX, y: scrollY })).toEqual({
        x: 500 - scrollX,
        y: 320 - scrollY,
        w: 80,
        h: 40,
      });
    },
  );

  it('keeps the aspect ratio for Shift corners and expands both sides for Alt', () => {
    const rect = { x: 10, y: 10, w: 160, h: 90 };
    const ratio = resizeFromDelta(rect, 'se', 32, 4, { shift: true });
    expect(ratio.w / ratio.h).toBeCloseTo(16 / 9);
    const symmetric = resizeFromDelta(rect, 'se', 10, 5, { alt: true });
    expect(symmetric).toMatchObject({ x: 0, y: 5, w: 180, h: 100 });
  });

  it('snaps to an 8px grid and caps large sizes', () => {
    expect(resizeFromDelta({ x: 0, y: 0, w: 100, h: 40 }, 'e', 5, 0, { snap: true }).w).toBe(104);
    expect(resizeFromDelta({ x: 0, y: 0, w: 100, h: 40 }, 'e', 9000, 0).w).toBe(5000);
  });

  it.each([
    [240, 'auto', 600, '240px'],
    [240, '15rem', 600, '15rem'],
    [240, '15em', 600, '15em'],
    [120, '20%', 600, '20%'],
    [121, '20%', 600, '20%'],
    [232, '14.5rem', 600, '14.5rem'],
    [236, '14.75em', 600, '14.75em'],
    [100, '25%', 400, '25%'],
    [240, '20vw', 600, '40vw'],
  ])('converts %i canvas pixels from %s into %s', (px, current, parent, expected) => {
    expect(resizeCssValue(px, current, parent)).toBe(expected);
  });

  it.each([
    ['120px', 120, 600],
    ['15rem', 240, 600],
    ['15em', 240, 600],
    ['20%', 120, 600],
    ['40vw', 240, 600],
    ['auto', 90, 600],
  ])('converts current value %s into canvas pixels', (value, expected, parent) => {
    expect(resizePixels(value, 90, parent)).toBe(expected);
  });

  it('keeps a 5,000 element selection and 200 coalesced drag calculations within the 30 second sanity bound', () => {
    const elements = Array.from({ length: 5000 }, (_, index) => ({
      id: `el-${String(index)}`,
      x: index,
      y: index,
      w: 120,
      h: 40,
    }));
    const selected = elements.find((element) => element.id === 'el-4999');
    if (!selected) throw new Error('the selected fixture exists');
    const start = performance.now();
    for (let move = 0; move < 200; move += 1) resizeFromDelta(selected, 'e', move / 2, 0);
    expect(performance.now() - start).toBeLessThan(30_000);
  }, 30_000);
});
