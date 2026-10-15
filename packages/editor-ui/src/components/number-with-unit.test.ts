import { describe, expect, it } from 'vitest';
import { formatCssNumber } from './number-with-unit';

describe('formatCssNumber', () => {
  it('uses a locale-independent decimal point and trims trailing zeroes', () => {
    expect(formatCssNumber(2.75)).toBe('2.75');
    expect(formatCssNumber(2.7)).toBe('2.7');
    expect(formatCssNumber(2)).toBe('2');
    expect(formatCssNumber(2.755)).toBe('2.75');
  });
});
