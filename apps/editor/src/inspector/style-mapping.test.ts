import { describe, expect, it } from 'vitest';
import { STYLE_FIELDS, styleSelector } from './style-mapping';

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
});
