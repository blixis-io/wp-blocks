import { describe, expect, it } from 'vitest';
import { checkPresetAccessibility, contrastRatio, relativeLuminance } from './contrast.ts';
import type { Preset } from './schema.ts';

const preset: Preset = {
  schemaVersion: 1,
  id: 'test',
  label: 'Test',
  description: 'Contrast test',
  tokens: [
    { name: 'color-bg', category: 'color', value: '#fff', dark: '#111' },
    { name: 'color-text', category: 'color', value: '#111', dark: '#fff' },
    { name: 'color-link', category: 'color', value: '#000', dark: '#fff' },
    { name: 'color-primary', category: 'color', value: '#000', dark: '#fff' },
    { name: 'color-on-primary', category: 'color', value: '#fff', dark: '#000' },
    { name: 'color-line', category: 'color', value: '#777', dark: '#aaa' },
  ],
};

describe('WCAG sRGB contrast', () => {
  it('uses linear luminance and the WCAG ratio', () => {
    expect(relativeLuminance('#000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBe(1);
    expect(contrastRatio('#000', '#fff')).toBe(21);
    expect(contrastRatio('#777', '#fff')).toBeCloseTo(4.48, 2);
    expect(contrastRatio('#fff', '#777')).toBeCloseTo(4.48, 2);
  });

  it('reports unsupported forms instead of estimating their contrast', () => {
    expect(contrastRatio('rgb(0 0 0)', '#fff')).toBeUndefined();
    expect(contrastRatio('#0008', '#fff')).toBeUndefined();
    expect(contrastRatio('transparent', '#fff')).toBeUndefined();
    const edited = structuredClone(preset);
    const text = edited.tokens.find((token) => token.name === 'color-text');
    if (!text) throw new Error('Fixture missing color-text');
    text.dark = 'rgb(255 255 255)';
    expect(checkPresetAccessibility(edited)).toContainEqual({
      code: 'unsupported-color',
      mode: 'dark',
      foreground: 'color-text',
    });
  });

  it('checks both modes, aliases, missing semantics and pair-specific thresholds', () => {
    expect(checkPresetAccessibility(preset)).toEqual([]);
    const edited = structuredClone(preset);
    const text = edited.tokens.find((token) => token.name === 'color-text');
    if (!text) throw new Error('Fixture missing color-text');
    text.dark = '#222';
    expect(checkPresetAccessibility(edited)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'low-contrast',
          mode: 'dark',
          foreground: 'color-text',
          background: 'color-bg',
          minimum: 4.5,
        }),
      ]),
    );
    edited.tokens = edited.tokens.filter((token) => token.name !== 'color-on-primary');
    expect(checkPresetAccessibility(edited)).toContainEqual({
      code: 'missing-token',
      mode: 'light',
      foreground: 'color-on-primary',
    });
    const link = edited.tokens.find((token) => token.name === 'color-link');
    if (!link) throw new Error('Fixture missing color-link');
    link.value = 'var(--blx-color-text)';
    expect(
      checkPresetAccessibility(edited).some((issue) => issue.foreground === 'color-link' && issue.mode === 'light'),
    ).toBe(false);
  });
});
