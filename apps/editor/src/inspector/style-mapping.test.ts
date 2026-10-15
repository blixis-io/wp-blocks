import { describe, expect, it } from 'vitest';
import {
  humanizeTokenName,
  shouldUseSelect,
  STYLE_FIELDS,
  styleSelector,
  TEXT_ALIGNMENT_ICON_MAP,
} from './style-mapping';

describe('inspector style schema mapping', () => {
  it.each(STYLE_FIELDS)('maps $id to the $kind control family', (field) => {
    expect(['spacing', 'token', 'select']).toContain(field.kind);
    expect(field.key).toMatch(/^inspector\.style\./);
  });

  it('uses the compiler contract for the base selector', () => {
    expect(styleSelector('base')).toEqual({});
  });

  it.each(['tablet', 'mobile', 'wide'])('preserves the %s breakpoint override', (breakpoint) => {
    expect(styleSelector(breakpoint)).toEqual({ breakpoint });
  });

  it('defines spacing, token and typography field families', () => {
    expect(STYLE_FIELDS.filter(({ kind }) => kind === 'spacing').map(({ id }) => id)).toEqual(['margin', 'padding']);
    expect(STYLE_FIELDS.filter(({ kind }) => kind === 'token').map(({ id }) => id)).toContain('font-size');
    expect(STYLE_FIELDS.filter(({ id }) => id === 'font-weight' || id === 'line-height')).toHaveLength(2);
  });

  it('humanises known tokens without exposing CSS syntax in English and Dutch', () => {
    expect(humanizeTokenName('--blx-shadow-card')).toBe('Card');
    expect(humanizeTokenName('--blx-shadow-raised', 'nl_NL')).toBe('Verhoogd');
    expect(humanizeTokenName('--blx-shadow-overlay', 'nl_NL')).toBe('Overlay');
    expect(humanizeTokenName('--blx-color-brand')).toBe('Color brand');
  });

  it('uses a select for large or long option sets', () => {
    expect(shouldUseSelect(['None', 'Card'])).toBe(false);
    expect(shouldUseSelect(['Block', 'Inline', 'Inline block'])).toBe(true);
    expect(shouldUseSelect(['1', '2', '3', '4', '5'])).toBe(true);
  });

  it('keeps the explicit text alignment icon map', () => {
    expect(TEXT_ALIGNMENT_ICON_MAP).toEqual({
      left: 'textAlignLeft',
      center: 'textAlignCenter',
      right: 'textAlignRight',
      justify: 'textAlignJustify',
    });
  });

  it('uses unique short visible labels for every style field', () => {
    const labels = STYLE_FIELDS.map(({ key }) => key);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
