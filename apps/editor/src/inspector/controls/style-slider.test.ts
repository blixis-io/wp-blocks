import { describe, expect, it } from 'vitest';
import { clampSliderDisplay, convertStyleUnit, styleSliderRange } from './style-slider';
import { sliderFillProgress, sliderProgress } from '@blixis/wp-editor-ui';

describe('unit-aware style sliders', () => {
  it('selects ranges from the active unit', () => {
    expect(styleSliderRange('font-size', 'px')).toEqual({ min: 8, max: 96, step: 1 });
    expect(styleSliderRange('font-size', 'rem')).toEqual({ min: 0.5, max: 6, step: 0.05 });
    expect(styleSliderRange('font-size', '%')).toEqual({ min: 0, max: 100, step: 1 });
    expect(styleSliderRange('line-height', '')).toEqual({ min: 0.8, max: 3, step: 0.05 });
    expect(styleSliderRange('letter-spacing', 'em')).toEqual({ min: -0.2, max: 1, step: 0.01 });
    expect(styleSliderRange('letter-spacing', 'px')).toEqual({ min: -5, max: 20, step: 0.5 });
    expect(styleSliderRange('border-radius', 'rem')).toEqual({ min: 0, max: 4, step: 0.05 });
    expect(styleSliderRange('border-radius', '%')).toEqual({ min: 0, max: 50, step: 1 });
  });

  it('converts px and rem/em values using a 16px base', () => {
    expect(convertStyleUnit(44, 'px', 'rem')).toBe(2.75);
    expect(convertStyleUnit(2.75, 'rem', 'px')).toBe(44);
    expect(convertStyleUnit(2.75, 'em', 'px')).toBe(44);
  });

  it('clamps only the displayed thumb and maps fill in both directions', () => {
    expect(clampSliderDisplay(2.75, 0.5, 6)).toBe(2.75);
    expect(clampSliderDisplay(120, 8, 96)).toBe(96);
    expect(sliderProgress(2.75, 0.5, 6)).toBeCloseTo(0.409);
    expect(sliderFillProgress(2.75, 0.5, 6)).toBeCloseTo(0.409);
    expect(sliderFillProgress(2.75, 0.5, 6, true)).toBeCloseTo(0.591);
  });
});
