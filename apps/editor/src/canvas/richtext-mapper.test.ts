import { describe, expect, it } from 'vitest';
import { fromModel, toModel } from './richtext-mapper';

describe('ADR 0014 Tiptap mapper', () => {
  it.each(Array.from({ length: 128 }, (_, i) => i))('round trips mark bitset %i', (bits) => {
    const names = ['strong', 'em', 'u', 's', 'code'] as const;
    const marks = names.filter((_, index) => (bits & (1 << index)) !== 0);
    const model = {
      v: 1 as const,
      inline: [{ t: 'text' as const, s: 'sample', ...(marks.length ? { m: marks } : {}) }],
    };
    expect(toModel(fromModel(model))).toEqual(model.inline.length && marks.length ? model : 'sample');
  });
  it('drops unknown nodes, unknown marks, hostile attrs and unsafe links', () => {
    const mapped = toModel({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'image', attrs: { src: 'javascript:alert(1)' } },
            {
              type: 'text',
              text: 'safe',
              marks: [
                { type: 'mystery', attrs: { onclick: 'x' } },
                { type: 'link', attrs: { href: 'javascript:alert(1)' } },
              ],
            },
          ],
        },
      ],
    });
    expect(mapped).toBe('safe');
  });
  it('collapses unmarked text to a string and preserves explicit breaks', () => {
    expect(toModel(fromModel('Hello'))).toBe('Hello');
    expect(toModel(fromModel({ v: 1, inline: [{ t: 'text', s: 'a' }, { t: 'br' }, { t: 'text', s: 'b' }] }))).toEqual({
      v: 1,
      inline: [{ t: 'text', s: 'a' }, { t: 'br' }, { t: 'text', s: 'b' }],
    });
  });
  it('bounds huge documents and filters unknown token ids', () => {
    expect(
      toModel({ type: 'doc', content: Array.from({ length: 5001 }, () => ({ type: 'paragraph', content: [] })) }),
    ).toBe('');
    expect(
      toModel(
        {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'x', marks: [{ type: 'blxStyle', attrs: { color: 'unknown' } }] }],
            },
          ],
        },
        new Set(['known']),
      ),
    ).toBe('x');
  });
  it('normalization is idempotent', () => {
    const value = {
      v: 1,
      inline: [
        { t: 'text', s: 'a', m: ['em', 'strong'] },
        { t: 'text', s: 'b', m: ['strong', 'em'] },
      ],
    };
    const once = toModel(fromModel(value));
    expect(toModel(fromModel(once))).toEqual(once);
  });
});
