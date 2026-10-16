import { describe, expect, it } from 'vitest';
import { isSafeUrl } from './url.ts';
import { readFileSync } from 'node:fs';

const cp = (...codes: number[]): string => String.fromCodePoint(...codes);

describe('isSafeUrl', () => {
  it('matches the shared cross-language URL corpus', () => {
    const cases = JSON.parse(
      readFileSync(new URL('../../../tests/fixtures/rich-text/cases.json', import.meta.url), 'utf8'),
    ) as { url_cases: { value: string; safe: boolean }[] };
    for (const row of cases.url_cases) expect(isSafeUrl(row.value), row.value).toBe(row.safe);
  });
  it.each([
    '',
    '#',
    '#top',
    '/',
    '/a/b?c=1&d=2#x',
    'a/b',
    '../up',
    '?q=1',
    'page.html',
    'http://example.com',
    'HTTPS://Example.com/Path?x=1&y=2',
    'https://example.com/a?b=1&c=2#frag',
    'mailto:someone@example.com',
    'tel:+31612345678',
    'https://example.com/caf' + cp(0xe9),
    '/path/with%20space',
    '/a;b=c',
  ])('accepts %j', (value) => {
    expect(isSafeUrl(value)).toBe(true);
  });

  it.each([
    ['javascript:', 'javascript:alert(1)'],
    ['mixed case scheme', 'JaVaScRiPt:alert(1)'],
    ['data URL', 'data:text/html,<script>alert(1)</script>'],
    ['vbscript', 'vbscript:msgbox(1)'],
    ['blob', 'blob:https://example.com/uuid'],
    ['file', 'file:///etc/passwd'],
    ['ftp', 'ftp://example.com/x'],
    ['an unknown scheme', 'a:b'],
    ['a Windows path', 'C:\\Windows\\system32'],
    ['protocol-relative', '//evil.example'],
    ['backslash host', '/\\evil.example'],
    ['double backslash', '\\\\evil.example'],
    ['leading space', ' https://example.com'],
    ['trailing space', 'https://example.com '],
    ['inner space', 'https://exa mple.com'],
    ['tab inside the scheme', 'java' + cp(9) + 'script:alert(1)'],
    ['newline inside the scheme', 'java' + cp(10) + 'script:alert(1)'],
    ['carriage return inside the scheme', 'java' + cp(13) + 'script:alert(1)'],
    ['NUL inside the scheme', 'java' + cp(0) + 'script:alert(1)'],
    ['zero-width space inside the scheme', 'java' + cp(0x200b) + 'script:alert(1)'],
    ['soft hyphen-like word joiner', 'java' + cp(0x2060) + 'script:alert(1)'],
    ['byte order mark first', cp(0xfeff) + 'javascript:alert(1)'],
    ['right-to-left override', 'https://example.com/' + cp(0x202e) + 'gnp.exe'],
    ['line separator', 'https://example.com/' + cp(0x2028)],
    ['no-break space', 'https://example.com/' + cp(0xa0)],
    ['ideographic space', 'https://example.com/' + cp(0x3000)],
    ['a character reference rebuilding the colon', 'javascript&colon;alert(1)'],
    ['a numeric character reference', 'javascript&#58;alert(1)'],
    ['a hex character reference', 'javascript&#x3a;alert(1)'],
    ['a numeric reference without semicolon', 'javascript&#58alert(1)'],
    ['a hex reference without semicolon', 'javascript&#x3aalert(1)'],
    ['a colon before the first slash', 'foo:bar/baz'],
    ['percent-encoded colon trick still has a colon', 'javascript%3Aalert(1):x'],
    ['too long', 'https://example.com/' + 'a'.repeat(2040)],
  ])('rejects %s', (_name, value) => {
    expect(isSafeUrl(value)).toBe(false);
  });

  it('accepts a query string that merely contains &-separated parameters (not character references)', () => {
    expect(isSafeUrl('/p?a=1&b=2&c=3')).toBe(true);
    expect(isSafeUrl('/p?a=1&b;c=2')).toBe(false); // looks like &b; -> conservative
  });

  it('is exactly at the length limit', () => {
    expect(isSafeUrl('/' + 'a'.repeat(2047))).toBe(true);
    expect(isSafeUrl('/' + 'a'.repeat(2048))).toBe(false);
  });
});
