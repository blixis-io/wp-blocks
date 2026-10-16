import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  markCount,
  normalizeRich,
  plainToRich,
  richEquals,
  richToPlain,
  validateRichText,
  type RichText,
} from './rich-text.ts';
import { isSafeUrl } from './safe-url.ts';

const good: RichText = {
  v: 1,
  inline: [{ t: 'text', s: 'Hello', m: ['strong'] }, { t: 'br' }, { t: 'text', s: 'world' }],
};
const corpus = JSON.parse(
  readFileSync(new URL('../../../../tests/fixtures/rich-text/cases.json', import.meta.url), 'utf8'),
) as {
  valid: { id: string; value: unknown }[];
  invalid: { id: string; value: unknown }[];
  url_cases: { value: string; safe: boolean }[];
};

describe('inline rich text', () => {
  it('matches the shared valid and malicious fixture corpus', () => {
    for (const row of corpus.valid) expect(validateRichText(row.value).ok, row.id).toBe(true);
    for (const row of corpus.invalid) {
      expect(validateRichText(row.value).ok, row.id).toBe(false);
      const raw = (row as { raw_invalid_json?: string }).raw_invalid_json;
      if (raw !== undefined) expect(validateRichText(JSON.parse(raw)).ok, `${row.id} raw JSON`).toBe(false);
    }
  });
  it('matches the shared URL corpus', () => {
    for (const row of corpus.url_cases) expect(isSafeUrl(row.value), row.value).toBe(row.safe);
  });
  it('orders non-ASCII URL marks deterministically', () => {
    const result = validateRichText({
      v: 1,
      inline: [
        {
          t: 'text',
          s: 'accent',
          m: [{ style: { color: 'color-primary' } }, { link: { href: 'https://example.test/é' } }],
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.value.inline[0]).toEqual({
        t: 'text',
        s: 'accent',
        m: [{ link: { href: 'https://example.test/é' } }, { style: { color: 'color-primary' } }],
      });
  });
  it('validates and normalizes a rich value', () => {
    expect(validateRichText(good).ok).toBe(true);
    expect(validateRichText({ v: 1, inline: [{ t: 'text', s: 'x', m: ['em', 'strong', 'em'] }] })).toEqual({
      ok: true,
      value: { v: 1, inline: [{ t: 'text', s: 'x', m: ['strong', 'em'] }] },
    });
  });
  it('converts plain text and round-trips line breaks', () => {
    expect(richToPlain(plainToRich('one\ntwo'))).toBe('one\ntwo');
    expect(normalizeRich(plainToRich('one\ntwo'))).toEqual(plainToRich('one\ntwo'));
  });
  it('is idempotent and compares normalized runs', () => {
    const split: RichText = {
      v: 1,
      inline: [
        { t: 'text', s: 'a', m: ['strong'] },
        { t: 'text', s: 'b', m: ['strong'] },
      ],
    };
    expect(normalizeRich(normalizeRich(split))).toEqual(normalizeRich(split));
    expect(richEquals(split, { v: 1, inline: [{ t: 'text', s: 'ab', m: ['strong'] }] })).toBe(true);
  });
  it('counts marks', () => {
    expect(markCount(good)).toBe(1);
  });
  it.each(Array.from({ length: 100 }, (_, i) => i))('rejects hostile variation %i', (i) => {
    const value = { v: 1, inline: [{ t: 'text', s: 'x', m: [i % 2 ? 'javascript' : 'strong', 'strong'] }] };
    if (i % 2) expect(validateRichText(value).ok).toBe(false);
    else expect(validateRichText(value).ok).toBe(true);
  });
  it('accepts the exact character and node boundaries and rejects +1', () => {
    expect(validateRichText({ v: 1, inline: [{ t: 'text', s: 'x'.repeat(20_000) }] }).ok).toBe(true);
    expect(validateRichText({ v: 1, inline: [{ t: 'text', s: 'x'.repeat(20_001) }] })).toEqual({
      ok: false,
      code: 'rich-too-many-characters',
    });
    expect(validateRichText({ v: 1, inline: Array.from({ length: 5000 }, () => ({ t: 'br' })) }).ok).toBe(true);
    expect(validateRichText({ v: 1, inline: Array.from({ length: 5001 }, () => ({ t: 'br' })) })).toEqual({
      ok: false,
      code: 'rich-too-many-nodes',
    });
  }, 10_000);
  it('bounds a wide mark array and rejects nested node shapes without recursive work', () => {
    expect(
      validateRichText({ v: 1, inline: [{ t: 'text', s: 'x', m: Array.from({ length: 10_000 }, () => 'strong') }] }),
    ).toEqual({ ok: false, code: 'rich-too-many-marks' });
    expect(validateRichText({ v: 1, inline: [{ t: 'text', s: 'x', children: [{ t: 'text', s: 'nested' }] }] })).toEqual(
      { ok: false, code: 'rich-invalid-type' },
    );
  }, 10_000);
  it('enforces the mark-count and href boundaries exactly', () => {
    const eight = {
      v: 1,
      inline: [
        {
          t: 'text',
          s: 'x',
          m: [
            'strong',
            'em',
            'u',
            's',
            'code',
            { style: { weight: 'bold' } },
            { link: { href: '/x' } },
            { style: { color: 'color-primary' } },
          ],
        },
      ],
    };
    const nine = { v: 1, inline: [{ t: 'text', s: 'x', m: [...(eight.inline[0]?.m ?? []), 'strong'] }] };
    expect(validateRichText(eight).ok).toBe(true);
    expect(validateRichText(nine)).toEqual({ ok: false, code: 'rich-too-many-marks' });
    expect(
      validateRichText({ v: 1, inline: [{ t: 'text', s: 'x', m: [{ link: { href: `/${'a'.repeat(2047)}` } }] }] }).ok,
    ).toBe(true);
    expect(
      validateRichText({ v: 1, inline: [{ t: 'text', s: 'x', m: [{ link: { href: `/${'a'.repeat(2048)}` } }] }] }).ok,
    ).toBe(false);
  });
  it.each([
    ['javascript:alert(1)', false],
    ['JaVaScRiPt:alert(1)', false],
    ['data:text/html,x', false],
    ['//evil.test', false],
    ['/safe/path', true],
    ['mailto:a@example.test', true],
  ])('link URL %s safety', (href, safe) => {
    expect(validateRichText({ v: 1, inline: [{ t: 'text', s: 'x', m: [{ link: { href } }] }] }).ok).toBe(safe);
  });
  it('rejects style ids absent from an explicitly supplied active token set', () => {
    const value = { v: 1, inline: [{ t: 'text', s: 'x', m: [{ style: { color: 'color-unknown' } }] }] };
    expect(validateRichText(value, new Set(['color-known']))).toEqual({ ok: false, code: 'rich-unknown-token' });
    expect(validateRichText(value, new Set(['color-unknown'])).ok).toBe(true);
  });
});
