import { describe, expect, it } from 'vitest';
import {
  BOX_SIDES,
  boxProperty,
  boxSideValue,
  boxStep,
  formatBoxValue,
  parseBoxValue,
  resetBoxSide,
  setLinkedBoxSides,
  validBoxValue,
} from './box-model';

describe('box model helpers', () => {
  it.each([
    ['12px', 12, 'px'],
    ['-2.5rem', -2.5, 'rem'],
    ['.75em', 0.75, 'em'],
    ['10%', 10, '%'],
    ['0', 0, 'px'],
  ] as const)('parses %s', (raw, number, unit) => {
    expect(parseBoxValue(raw)).toEqual({ number, unit });
  });
  it.each(['auto', '', 'var(--blx-space-2)', '10vw', 'NaNpx'])('rejects unsupported numeric value %s', (raw) => {
    expect(parseBoxValue(raw)).toBeNull();
  });
  it.each([
    [0, 'px', '0px'],
    [12.349, 'rem', '12.35rem'],
    [-0.001, 'em', '0em'],
    [25, '%', '25%'],
  ] as const)('formats values', (number, unit, expected) => {
    expect(formatBoxValue(number, unit)).toBe(expected);
  });
  it.each([
    ['px', false, false, 1],
    ['px', true, false, 10],
    ['rem', false, true, 0.1],
    ['em', true, true, 0.1],
    ['%', true, false, 10],
  ] as const)('uses the correct step', (unit, shift, alt, expected) => {
    expect(boxStep(unit, shift, alt)).toBe(expected);
  });
  it.each(BOX_SIDES)('maps margin %s to a logical property', (side) => {
    expect(boxProperty('margin', side)).toBe(`margin-${side}`);
  });
  it.each(BOX_SIDES)('maps padding %s to a logical property', (side) => {
    expect(boxProperty('padding', side)).toBe(`padding-${side}`);
  });
  it.each(BOX_SIDES)('uses shared border width for %s', (side) => {
    expect(boxProperty('border', side)).toBe('border-width');
  });
  it.each(BOX_SIDES)('reads side overrides before shorthand for %s', (side) => {
    expect(boxSideValue('padding', side, { padding: '4px', [`padding-${side}`]: '8px' })).toBe('8px');
  });
  it('reads common border width', () => {
    expect(boxSideValue('border', 'block-start', { 'border-width': '2px' })).toBe('2px');
  });
  it.each(['margin', 'padding'] as const)('links all %s sides', (layer) => {
    const next = setLinkedBoxSides(layer, { color: 'red' }, '4px');
    expect(BOX_SIDES.every((side) => next[boxProperty(layer, side)] === '4px')).toBe(true);
    expect(next['color']).toBe('red');
  });
  it('links border as one allowed shorthand', () => {
    expect(setLinkedBoxSides('border', {}, '1px')).toEqual({ 'border-width': '1px' });
  });
  it.each(BOX_SIDES)('resets only the selected margin side %s', (side) => {
    const all = Object.fromEntries(BOX_SIDES.map((key) => [boxProperty('margin', key), '2px']));
    expect(resetBoxSide('margin', side, all)).not.toHaveProperty(boxProperty('margin', side));
    expect(Object.keys(resetBoxSide('margin', side, all))).toHaveLength(3);
  });
  it('resets border width to inherited', () => {
    expect(resetBoxSide('border', 'block-start', { 'border-width': '2px' })).toEqual({});
  });
  it.each(['0px', '12px', '-3rem', '25%', 'auto'] as const)('validates accepted margin value %s', (value) => {
    expect(validBoxValue('margin', 'block-start', value)).toBe(true);
  });
  it.each(['2px', '0%', '10em'] as const)('validates accepted padding value %s', (value) => {
    expect(validBoxValue('padding', 'inline-end', value)).toBe(true);
  });
  it.each(['-1px', 'auto'] as const)('rejects invalid padding value %s', (value) => {
    expect(validBoxValue('padding', 'block-start', value)).toBe(false);
  });
  it('rejects invalid border value', () => {
    expect(validBoxValue('border', 'block-start', '-1px')).toBe(false);
  });
});
