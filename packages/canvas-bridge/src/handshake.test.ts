import { describe, expect, it } from 'vitest';
import { parseHello, parseInit } from './handshake.ts';
import { LIMITS } from './limits.ts';
import { INIT_PAYLOAD, NONCE } from './fakes.test-helper.ts';

const hello = { type: 'blx-canvas-hello', version: 1, nonce: NONCE };
const init = { type: 'blx-canvas-init', version: 1, nonce: NONCE, ...INIT_PAYLOAD };

describe('hello', () => {
  it('accepts nonces of 16 to 64 url-safe characters', () => {
    for (const nonce of ['a'.repeat(16), 'A-_9'.repeat(16), NONCE])
      expect(parseHello({ ...hello, nonce }).ok).toBe(true);
  });
  it.each([
    ['short nonce', { ...hello, nonce: 'a'.repeat(15) }],
    ['long nonce', { ...hello, nonce: 'a'.repeat(LIMITS.nonceMax + 1) }],
    ['bad characters', { ...hello, nonce: 'a'.repeat(15) + '+' }],
    ['newline', { ...hello, nonce: `${'a'.repeat(16)}\n` }],
    ['wrong version', { ...hello, version: 2 }],
    ['string version', { ...hello, version: '1' }],
    ['wrong type', { ...hello, type: 'blx-canvas-init' }],
    ['extra key', { ...hello, extra: true }],
    ['missing nonce', { type: hello.type, version: 1 }],
    ['number nonce', { ...hello, nonce: 1234567890123456 }],
    ['null', null],
    ['string', 'blx-canvas-hello'],
    ['pollution', JSON.parse(`{"type":"blx-canvas-hello","version":1,"nonce":"${NONCE}","__proto__":{"a":1}}`)],
  ])('refuses %s', (_name, value) => {
    expect(parseHello(value).ok).toBe(false);
  });
});

describe('init', () => {
  it('accepts a valid init', () => {
    expect(parseInit(init)).toEqual({ ok: true, value: init });
  });
  it.each([
    ['viewport width low', { ...init, viewport: { width: 199, breakpoint: 'base' } }],
    ['viewport extra key', { ...init, viewport: { width: 300, breakpoint: 'base', x: 1 } }],
    ['viewport missing', { ...init, viewport: undefined }],
    ['mode', { ...init, mode: 'auto' }],
    ['locale hyphen', { ...init, locale: 'nl-NL' }],
    ['locale long', { ...init, locale: 'nl_' + 'A'.repeat(20) }],
    ['locale script', { ...init, locale: 'nl_NL<script>' }],
    ['dir', { ...init, dir: 'auto' }],
    ['version', { ...init, version: 0 }],
    ['nonce shape', { ...init, nonce: 'short' }],
    ['extra', { ...init, ports: 1 }],
  ])('refuses %s', (_name, value) => {
    expect(parseInit(value).ok).toBe(false);
  });
});

describe('hostile objects', () => {
  it('never throw', () => {
    const proxy = new Proxy(
      {},
      {
        ownKeys: () => {
          throw new Error('boom');
        },
      },
    );
    for (const fn of [parseHello, parseInit]) expect(fn(proxy)).toEqual({ ok: false, reason: 'malformed' });
  });
});
