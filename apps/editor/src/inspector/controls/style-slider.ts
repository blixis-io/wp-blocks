export interface StyleSliderRange {
  min: number;
  max: number;
  step: number;
}

const FONT_SIZE_RANGES: Readonly<Record<string, StyleSliderRange>> = {
  px: { min: 8, max: 96, step: 1 },
  rem: { min: 0.5, max: 6, step: 0.05 },
  em: { min: 0.5, max: 6, step: 0.05 },
  '%': { min: 0, max: 100, step: 1 },
};

export function styleSliderRange(property: string, unit: string): StyleSliderRange | undefined {
  if (property === 'font-size') return FONT_SIZE_RANGES[unit] ?? FONT_SIZE_RANGES['px'];
  if (property === 'line-height') return { min: 0.8, max: 3, step: 0.05 };
  if (property === 'letter-spacing') {
    if (unit === 'em' || unit === 'rem') return { min: -0.2, max: 1, step: 0.01 };
    return { min: -5, max: 20, step: 0.5 };
  }
  if (property === 'border-radius') {
    if (unit === 'rem') return { min: 0, max: 4, step: 0.05 };
    if (unit === '%') return { min: 0, max: 50, step: 1 };
    return { min: 0, max: 64, step: 1 };
  }
  if (property === 'border-width') return { min: 0, max: 20, step: 1 };
  return undefined;
}

export function convertStyleUnit(value: number, from: string, to: string): number {
  if (from === to) return value;
  if (from === 'px' && (to === 'rem' || to === 'em')) return Number((value / 16).toFixed(2));
  if ((from === 'rem' || from === 'em') && to === 'px') return Number((value * 16).toFixed(2));
  return value;
}

export function clampSliderDisplay(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
