import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyCommand, validateDocument, type BuilderDocument } from '@blixis/wp-core';
import { describe, expect, it } from 'vitest';
import { checkAgainstRegistry } from './checks.ts';
import { CORE_ELEMENTS, createCoreRegistry } from './core-elements.ts';
import { comparePropertyIds, type PropertyIdLock } from './lock.ts';

const registry = createCoreRegistry();
const here = dirname(fileURLToPath(import.meta.url));

describe('localized properties (translatable and locale-specific)', () => {
  it('lists the properties whose values live in the translation streams, in definition order', () => {
    expect(registry.localizedProperties('blixis/heading')).toEqual([
      { id: 'text', kind: 'string', classification: 'translatable' },
    ]);
    expect(registry.localizedProperties('blixis/button')).toEqual([
      { id: 'label', kind: 'string', classification: 'translatable' },
      { id: 'href', kind: 'url', classification: 'locale-specific' },
    ]);
    expect(registry.localizedProperties('blixis/section')).toEqual([]);
    expect(registry.localizedProperties('acme/unknown')).toEqual([]);
  });

  it('translationValue accepts valid values and refuses the rest with a stable code', () => {
    expect(registry.translationValue('blixis/heading', 'text', 'Hello')).toEqual({ ok: true });
    expect(registry.translationValue('blixis/button', 'href', '/contact')).toEqual({ ok: true });
    expect(registry.translationValue('blixis/button', 'href', 'javascript:alert(1)')).toMatchObject({
      ok: false,
      code: 'invalid-translation',
    });
    expect(registry.translationValue('blixis/heading', 'text', 5)).toMatchObject({
      ok: false,
      code: 'invalid-translation',
    });
    expect(registry.translationValue('blixis/heading', 'text', 'x'.repeat(5000))).toMatchObject({
      ok: false,
      code: 'invalid-translation',
    });
    expect(registry.translationValue('blixis/heading', 'level', 2)).toMatchObject({
      ok: false,
      code: 'not-translatable',
    });
    expect(registry.translationValue('blixis/heading', 'nope', 'x')).toMatchObject({
      ok: false,
      code: 'not-translatable',
    });
    expect(registry.translationValue('acme/unknown', 'text', 'x')).toMatchObject({
      ok: false,
      code: 'not-translatable',
    });
    for (const hostile of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
      expect(registry.translationValue('blixis/heading', hostile, 'x')).toMatchObject({
        ok: false,
        code: 'not-translatable',
      });
    }
  });
});

describe('set-translation with the registry as its hook', () => {
  const doc = (): BuilderDocument => {
    const result = validateDocument({
      schemaVersion: 1,
      documentId: 'doc-001',
      layoutRevision: 1,
      defaultLocale: 'en_US',
      locales: ['en_US', 'nl_NL'],
      root: [
        {
          id: 'el-sec',
          type: 'blixis/section',
          props: { tag: 'section' },
          children: [
            { id: 'el-h', type: 'blixis/heading', props: { level: 2 }, children: [] },
            { id: 'el-b', type: 'blixis/button', props: {}, children: [] },
            { id: 'el-x', type: 'acme/gone', props: {}, children: [] },
          ],
        },
      ],
      classListVersion: 0,
      classRefs: {},
      translations: { en_US: { 'el-h': { status: 'translated', values: { text: 'Hello' } } } },
      metadata: { updatedAt: '2026-01-01T00:00:00Z', editorVersion: '0.0.0' },
    });
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    return result.document;
  };
  const ctx = { translationValue: registry.translationValue };
  const run = (document: BuilderDocument, set: Record<string, unknown>, id = 'el-h', locale = 'nl_NL') =>
    applyCommand(document, { type: 'set-translation', locale, elementId: id, set }, ctx);

  it('edits translatable and locale-specific values and keeps the document valid against the registry', () => {
    const a = run(doc(), { text: 'Hallo' });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const b = run(a.document, { label: 'Verstuur', href: '/nl/contact' }, 'el-b');
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(checkAgainstRegistry(b.document, registry).filter((i) => i.severity === 'error')).toEqual([]);
    expect(validateDocument(JSON.stringify(b.document)).ok).toBe(true);
  });

  it('refuses invariant properties, invalid values, and unknown types (their add-on is gone)', () => {
    const codeOf = (set: Record<string, unknown>, id = 'el-h'): string => {
      const r = run(doc(), set, id);
      return r.ok ? 'ok' : r.error.code;
    };
    expect(codeOf({ level: 3 })).toBe('not-translatable');
    expect(codeOf({ text: 12 })).toBe('invalid-translation');
    expect(codeOf({ href: 'data:text/html,x' }, 'el-b')).toBe('invalid-translation');
    expect(codeOf({ text: 'x' }, 'el-x')).toBe('not-translatable');
  });

  it('the registry rule and the command rule agree: whatever the command accepts passes checkAgainstRegistry', () => {
    let document = doc();
    const properties = ['text', 'label', 'href', 'level', 'alt', 'toString'];
    const values: unknown[] = ['Hello', '/x', 'javascript:x', 2, 'y'.repeat(40), '', null];
    let accepted = 0;
    for (let i = 0; i < 400; i += 1) {
      const id = ['el-h', 'el-b', 'el-x'][i % 3] ?? 'el-h';
      const set = { [properties[(i * 7) % properties.length] ?? 'text']: values[(i * 5) % values.length] };
      const r = run(document, set, id, i % 2 === 0 ? 'nl_NL' : 'en_US');
      if (!r.ok) continue;
      accepted += 1;
      document = r.document;
      expect(checkAgainstRegistry(document, registry).filter((issue) => issue.severity === 'error')).toEqual([]);
    }
    expect(accepted).toBeGreaterThan(20);
  });
});

describe('stale detection with the registry as its hook', () => {
  const build = (): BuilderDocument => {
    const result = validateDocument({
      schemaVersion: 1,
      documentId: 'doc-001',
      layoutRevision: 1,
      defaultLocale: 'en_US',
      locales: ['en_US', 'nl_NL'],
      root: [{ id: 'el-b', type: 'blixis/button', props: {}, children: [] }],
      classListVersion: 0,
      classRefs: {},
      translations: { en_US: { 'el-b': { status: 'translated', values: { label: 'Send', href: '/en/contact' } } } },
      metadata: { updatedAt: '2026-01-01T00:00:00Z', editorVersion: '0.0.0' },
    });
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    return result.document;
  };
  const ctx = { translationValue: registry.translationValue, sourceProperties: registry.sourceProperties };
  const run = (document: BuilderDocument, locale: string, set: Record<string, unknown>) => {
    const r = applyCommand(document, { type: 'set-translation', locale, elementId: 'el-b', set }, ctx);
    if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
    return r.document;
  };

  it('only translatable properties are source text', () => {
    expect(registry.sourceProperties('blixis/button')).toEqual(['label']);
    expect(registry.sourceProperties('blixis/heading')).toEqual(['text']);
    expect(registry.sourceProperties('blixis/section')).toEqual([]);
    expect(registry.sourceProperties('acme/unknown')).toEqual([]);
  });

  it('a changed button label makes the Dutch button stale, a changed link target does not', () => {
    let doc = run(build(), 'nl_NL', { label: 'Versturen', href: '/nl/contact' });
    expect(doc.translations['nl_NL']?.['el-b']?.status).toBe('draft');
    doc = run(doc, 'nl_NL', { label: 'Versturen' });
    doc = run(doc, 'en_US', { href: '/en/get-in-touch' });
    expect(doc.translations['nl_NL']?.['el-b']?.status).toBe('draft');
    const reviewed = applyCommand(
      doc,
      { type: 'set-translation', locale: 'nl_NL', elementId: 'el-b', status: 'reviewed' },
      ctx,
    );
    if (!reviewed.ok) throw new Error('review failed');
    doc = run(reviewed.document, 'en_US', { href: '/en/contact-us' });
    expect(doc.translations['nl_NL']?.['el-b']?.status).toBe('reviewed');
    doc = run(doc, 'en_US', { label: 'Submit' });
    expect(doc.translations['nl_NL']?.['el-b']).toMatchObject({
      status: 'stale',
      values: { label: 'Versturen', href: '/nl/contact' },
    });
  });
});

describe('stable property ids (locks/property-ids.json)', () => {
  const lock = JSON.parse(readFileSync(join(here, '..', 'locks', 'property-ids.json'), 'utf8')) as PropertyIdLock;

  it('every released property id still exists with the same classification and kind, and new ids are recorded', () => {
    expect(
      comparePropertyIds(lock, CORE_ELEMENTS, { requireRecorded: true }),
      'a released id was removed or changed (add a new id instead), or a new id must be appended to packages/element-registry/locks/property-ids.json',
    ).toEqual([]);
  });

  it('reports the problems it exists to catch', () => {
    const text = { classification: 'translatable', kind: 'string' };
    const level = { classification: 'invariant', kind: 'integer' };
    const heading = { type: 'blixis/heading', props: { text, level } };
    const others = CORE_ELEMENTS.filter((d) => d.type !== 'blixis/heading');
    const problems = (definitions: Parameters<typeof comparePropertyIds>[1], requireRecorded = false): string =>
      comparePropertyIds(lock, definitions, { requireRecorded }).join('\n');
    expect(problems([...others, heading])).toBe('');
    expect(problems([...others, { type: heading.type, props: { level } }])).toContain(
      'blixis/heading.text: property removed',
    );
    expect(problems(others)).toContain('blixis/heading: element removed');
    expect(
      problems([...others, { type: heading.type, props: { level, text: { ...text, classification: 'invariant' } } }]),
    ).toContain('changed from translatable string to invariant string');
    expect(problems([...others, { type: heading.type, props: { level, text, extra: text } }], true)).toContain(
      'blixis/heading.extra: not recorded in the lock',
    );
    expect(problems([...others, { type: heading.type, props: { level, text, extra: text } }])).not.toContain(
      'not recorded',
    );
  });
});
