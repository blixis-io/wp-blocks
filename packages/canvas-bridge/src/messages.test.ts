import { describe, expect, it } from 'vitest';
import { ID_PATTERN } from '@blixis/wp-core';
import { CANVAS_ERROR_CODES, ELEMENT_ID_PATTERN, LIMITS } from './limits.ts';
import { isElementId, parseCanvasMessage, parseParentMessage } from './messages.ts';

const ID = 'el-heading-1';
const ok = (result: { ok: boolean }) => result.ok;

describe('element ids', () => {
  it('use exactly the pattern of core', () => {
    expect(ELEMENT_ID_PATTERN).toBe(ID_PATTERN);
  });
  it('use the core pattern', () => {
    expect(isElementId(ID)).toBe(true);
    for (const bad of [
      '',
      'ab',
      'A-b-c',
      '__proto__',
      'constructor',
      'prototype',
      'a'.repeat(65),
      'el id',
      'el"]x',
      5,
      null,
      {},
    ]) {
      expect(isElementId(bad)).toBe(false);
    }
    expect(new RegExp(ID_PATTERN).test('a'.repeat(64))).toBe(true);
    expect(isElementId('a'.repeat(64))).toBe(true);
  });
});

describe('parent -> canvas messages', () => {
  const valid: unknown[] = [
    { type: 'render', html: '<p data-blx-id="el-heading-1">x</p>', css: '', revision: 0 },
    {
      type: 'render',
      html: 'h'.repeat(LIMITS.htmlMax),
      css: 'c'.repeat(LIMITS.cssMax),
      revision: Number.MAX_SAFE_INTEGER,
    },
    { type: 'viewport', width: 200, breakpoint: 'base' },
    { type: 'viewport', width: 4000, breakpoint: 'a'.repeat(32) },
    { type: 'mode', mode: 'light' },
    { type: 'mode', mode: 'dark' },
    { type: 'select', id: null },
    { type: 'select', id: ID },
    { type: 'hover', id: null },
    { type: 'hover', id: ID },
    { type: 'scroll-to', id: ID },
    { type: 'request-rects', revision: 0 },
    { type: 'request-rects', revision: Number.MAX_SAFE_INTEGER },
    { type: 'ping', n: 0 },
  ];
  it.each(valid.map((m) => [(m as { type: string }).type, m]))('accepts a valid %s', (_name, message) => {
    const result = parseParentMessage(message);
    expect(result.ok).toBe(true);
  });

  it('returns a copy with only the schema keys', () => {
    const input = { type: 'ping', n: 3 };
    const result = parseParentMessage(input);
    expect(result).toEqual({ ok: true, value: { type: 'ping', n: 3 } });
    expect(result.ok && result.value).not.toBe(input);
  });

  const invalid: [string, unknown][] = [
    ['non object', 'render'],
    ['null', null],
    ['array', [{ type: 'ping', n: 1 }]],
    ['unknown type', { type: 'eval', code: 'x' }],
    ['missing type', { n: 1 }],
    ['type not a string', { type: 7 }],
    ['render oversized html', { type: 'render', html: 'h'.repeat(LIMITS.htmlMax + 1), css: '', revision: 1 }],
    ['render oversized css', { type: 'render', html: '', css: 'c'.repeat(LIMITS.cssMax + 1), revision: 1 }],
    ['render float revision', { type: 'render', html: '', css: '', revision: 1.5 }],
    ['render negative revision', { type: 'render', html: '', css: '', revision: -1 }],
    ['render unsafe integer revision', { type: 'render', html: '', css: '', revision: 2 ** 53 }],
    ['render html not string', { type: 'render', html: 5, css: '', revision: 1 }],
    ['render missing css', { type: 'render', html: '', revision: 1 }],
    ['render extra key', { type: 'render', html: '', css: '', revision: 1, extra: 1 }],
    ['viewport too small', { type: 'viewport', width: 199, breakpoint: 'base' }],
    ['viewport too large', { type: 'viewport', width: 4001, breakpoint: 'base' }],
    ['viewport float', { type: 'viewport', width: 300.5, breakpoint: 'base' }],
    ['viewport NaN', { type: 'viewport', width: Number.NaN, breakpoint: 'base' }],
    ['viewport bad breakpoint', { type: 'viewport', width: 300, breakpoint: 'Tablet' }],
    ['viewport long breakpoint', { type: 'viewport', width: 300, breakpoint: 'a'.repeat(33) }],
    ['viewport breakpoint with newline', { type: 'viewport', width: 300, breakpoint: 'base\n' }],
    ['mode unknown', { type: 'mode', mode: 'sepia' }],
    ['select bad id', { type: 'select', id: 'x' }],
    ['select undefined id', { type: 'select', id: undefined }],
    ['select missing id', { type: 'select' }],
    ['hover bad id', { type: 'hover', id: '__proto__' }],
    ['scroll-to null', { type: 'scroll-to', id: null }],
    ['request-rects missing revision', { type: 'request-rects' }],
    ['request-rects negative revision', { type: 'request-rects', revision: -1 }],
    ['request-rects float revision', { type: 'request-rects', revision: 0.5 }],
    ['request-rects string revision', { type: 'request-rects', revision: '1' }],
    ['request-rects extra key', { type: 'request-rects', revision: 1, ids: [] }],
    ['ping float', { type: 'ping', n: 0.5 }],
    ['ping string', { type: 'ping', n: '1' }],
    ['prototype pollution key', JSON.parse('{"type":"ping","n":1,"__proto__":{"x":1}}')],
    ['constructor key', { type: 'ping', n: 1, constructor: { prototype: {} } }],
    [
      'class instance',
      new (class Foo {
        type = 'ping';
        n = 1;
      })(),
    ],
    ['symbol key', { type: 'ping', n: 1, [Symbol('s')]: 1 }],
    [
      'null prototype is fine but extra keys are not',
      Object.assign(Object.create(null) as object, { type: 'ping', n: 1, z: 1 }),
    ],
  ];
  it.each(invalid)('refuses %s', (_name, message) => {
    expect(ok(parseParentMessage(message))).toBe(false);
  });

  it('refuses accessor properties without running them', () => {
    let ran = false;
    const message = {
      type: 'ping',
      get n() {
        ran = true;
        return 1;
      },
    };
    expect(parseParentMessage(message).ok).toBe(false);
    expect(ran).toBe(false);
  });

  it('refuses a getter on the type key without running it', () => {
    let ran = false;
    const message = {
      get type() {
        ran = true;
        return 'ping';
      },
      n: 1,
    };
    expect(parseParentMessage(message).ok).toBe(false);
    expect(ran).toBe(false);
  });

  it('accepts a null-prototype object', () => {
    expect(parseParentMessage(Object.assign(Object.create(null) as object, { type: 'ping', n: 1 })).ok).toBe(true);
  });

  it('never echoes the payload in a failure', () => {
    const secret = 'SECRET-PAYLOAD-123';
    for (const message of [
      { type: secret },
      { type: 'mode', mode: secret },
      { type: 'select', id: secret, x: secret },
    ]) {
      expect(JSON.stringify(parseParentMessage(message))).not.toContain(secret);
    }
  });

  it('reports failure categories', () => {
    expect(parseParentMessage({ type: 'nope' })).toEqual({ ok: false, reason: 'unknown-type' });
    expect(parseParentMessage({ type: 'render', html: 'h'.repeat(LIMITS.htmlMax + 1), css: '', revision: 1 })).toEqual({
      ok: false,
      reason: 'too-large',
    });
    expect(parseParentMessage(null)).toEqual({ ok: false, reason: 'malformed' });
    expect(parseParentMessage({ type: 'mode', mode: 'x' })).toEqual({ ok: false, reason: 'invalid-field' });
  });

  it('never throws on hostile values', () => {
    const proxy = new Proxy(
      {},
      {
        get: () => {
          throw new Error('boom');
        },
        ownKeys: () => {
          throw new Error('boom');
        },
      },
    );
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    for (const hostile of [
      proxy,
      revoked.proxy,
      () => 1,
      Symbol('x'),
      10n,
      new Date(),
      /x/,
      new Map(),
      new Uint8Array(3),
    ]) {
      expect(() => parseParentMessage(hostile)).not.toThrow();
      expect(() => parseCanvasMessage(hostile)).not.toThrow();
    }
  });
});

describe('canvas -> parent messages', () => {
  const rect = { id: ID, x: 0, y: -1e6, w: 1e6, h: 0 };
  const valid: unknown[] = [
    { type: 'ready' },
    { type: 'rendered', revision: 4 },
    { type: 'size', width: 1, height: 1 },
    { type: 'size', width: LIMITS.sizeMax, height: LIMITS.sizeMax },
    { type: 'scroll', x: -LIMITS.coordinateMax, y: LIMITS.coordinateMax },
    { type: 'pick', id: ID, shift: true, alt: false },
    { type: 'hover', id: null },
    { type: 'hover', id: ID },
    { type: 'rects', revision: 1, items: [] },
    { type: 'rects', revision: 1, items: [rect, { ...rect, x: 12.5, y: 0.25 }] },
    ...CANVAS_ERROR_CODES.map((code) => ({ type: 'error', code })),
    { type: 'pong', n: 9 },
  ];
  it.each(valid.map((m, i) => [`${(m as { type: string }).type} #${String(i)}`, m]))('accepts %s', (_name, message) => {
    expect(parseCanvasMessage(message).ok).toBe(true);
  });

  it('accepts exactly 5,000 rect items and refuses 5,001', () => {
    const items = (n: number) => Array.from({ length: n }, () => rect);
    expect(parseCanvasMessage({ type: 'rects', revision: 1, items: items(LIMITS.rectsMax) }).ok).toBe(true);
    expect(parseCanvasMessage({ type: 'rects', revision: 1, items: items(LIMITS.rectsMax + 1) })).toEqual({
      ok: false,
      reason: 'too-large',
    });
  });

  const invalid: [string, unknown][] = [
    ['ready with payload', { type: 'ready', extra: 1 }],
    ['size zero', { type: 'size', width: 0, height: 10 }],
    ['size too big', { type: 'size', width: 100_001, height: 10 }],
    ['size float', { type: 'size', width: 10.5, height: 10 }],
    ['size Infinity', { type: 'size', width: Infinity, height: 10 }],
    ['scroll NaN', { type: 'scroll', x: Number.NaN, y: 0 }],
    ['scroll too large', { type: 'scroll', x: 0, y: LIMITS.coordinateMax + 1 }],
    ['scroll extra key', { type: 'scroll', x: 0, y: 0, extra: true }],
    ['pick without flags', { type: 'pick', id: ID }],
    ['pick truthy flag', { type: 'pick', id: ID, shift: 1, alt: false }],
    ['pick null id', { type: 'pick', id: null, shift: false, alt: false }],
    ['pick bad id', { type: 'pick', id: 'EVIL<script>', shift: false, alt: false }],
    ['hover undefined', { type: 'hover' }],
    ['rects items not array', { type: 'rects', revision: 1, items: {} }],
    ['rects item bad id', { type: 'rects', revision: 1, items: [{ ...rect, id: 'x' }] }],
    ['rects item NaN', { type: 'rects', revision: 1, items: [{ ...rect, x: Number.NaN }] }],
    ['rects item Infinity', { type: 'rects', revision: 1, items: [{ ...rect, w: Infinity }] }],
    ['rects item out of range', { type: 'rects', revision: 1, items: [{ ...rect, x: 1e6 + 1 }] }],
    ['rects item negative size', { type: 'rects', revision: 1, items: [{ ...rect, h: -1 }] }],
    ['rects item extra key', { type: 'rects', revision: 1, items: [{ ...rect, z: 1 }] }],
    ['rects item string number', { type: 'rects', revision: 1, items: [{ ...rect, x: '1' }] }],
    ['rects sparse array', { type: 'rects', revision: 1, items: new Array(2) }],
    ['rects null item', { type: 'rects', revision: 1, items: [null] }],
    ['error free text', { type: 'error', code: 'something bad happened' }],
    ['error missing code', { type: 'error' }],
    ['pong string', { type: 'pong', n: 'x' }],
    ['unknown type', { type: 'render', html: '', css: '', revision: 1 }],
    ['rendered negative', { type: 'rendered', revision: -1 }],
  ];
  it.each(invalid)('refuses %s', (_name, message) => {
    expect(parseCanvasMessage(message).ok).toBe(false);
  });

  it('refuses an array item with a getter without running it', () => {
    let ran = false;
    const items: unknown[] = [];
    Object.defineProperty(items, 0, {
      enumerable: true,
      get() {
        ran = true;
        return rect;
      },
    });
    expect(parseCanvasMessage({ type: 'rects', revision: 1, items }).ok).toBe(false);
    expect(ran).toBe(false);
  });

  it('never echoes the payload in a failure', () => {
    const secret = 'LEAK-ME-987';
    expect(JSON.stringify(parseCanvasMessage({ type: 'error', code: secret }))).not.toContain(secret);
    expect(JSON.stringify(parseCanvasMessage({ type: secret }))).not.toContain(secret);
  });
});
