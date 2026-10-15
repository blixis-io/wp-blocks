import { describe, expect, it } from 'vitest';
import { sliderProgress } from './slider';

describe('sliderProgress', () => {
  it('maps values to a clamped normalized track position', () => {
    expect(sliderProgress(2.75, 0.8, 3)).toBeCloseTo((2.75 - 0.8) / (3 - 0.8));
    expect(sliderProgress(-10, 0, 10)).toBe(0);
    expect(sliderProgress(20, 0, 10)).toBe(1);
  });

  it('returns zero for a degenerate or non-finite range', () => {
    expect(sliderProgress(1, 1, 1)).toBe(0);
    expect(sliderProgress(Number.NaN, 0, 10)).toBe(0);
  });
});
