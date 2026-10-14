import { join } from 'node:path';
import { validateDocument } from '@blixis/wp-core';
import { compile, type CompileInput } from '@blixis/wp-style-engine';
import { parse, resolve, type Context } from '@blixis/wp-style-engine/testing';
import { describe, expect, it } from 'vitest';
import { FIXTURES_ROOT, loadFixture } from './load.ts';

// The precedence matrix of ADR 0005 (BWB-107). One document holds every presence combination of the four rule layers, the same
// with a hover rule, and classes against element rules; compile-style-matrix.golden.css pins the exact stylesheet (the compile
// contract test) and this file checks what the stylesheet means. The expected values come from the hand-written rules below
// (the ADR in six lines), not from the library's own resolver, so this is a third, independent oracle next to
// tests/fixtures/style-resolution/verify.py and the reference resolver.
const fixture = loadFixture(join(FIXTURES_ROOT, 'compile', 'compile-style-matrix.fixture.json'));
const input = fixture.input as unknown as Omit<CompileInput, 'document'> & { document: unknown };
const validated = validateDocument(input.document);
if (!validated.ok) throw new Error(JSON.stringify(validated.errors));
const document = validated.document;
const result = compile({ ...input, document });
const css = parse(result.css);

type Theme = 'explicit' | 'auto' | 'unset';
const THEMES: Theme[] = ['explicit', 'auto', 'unset'];
const WIDTHS = [1440, 1024, 900, 641, 640, 400];
const MOBILE = (width: number): boolean => width <= 640;

function context(id: string, mode: 'light' | 'dark', theme: Theme, width: number): Context {
  return {
    dataTheme: theme === 'explicit' ? mode : theme === 'auto' ? 'auto' : undefined,
    // an explicit theme must win over a system preference that says the opposite
    system: theme === 'explicit' ? (mode === 'dark' ? 'light' : 'dark') : mode,
    width,
    states: [],
    classes: result.classNames.get(id) ?? [],
  };
}

/** Rules of the matrix, written out: dark+mobile > dark > mobile > base, and a state beats every layer. */
function matrixValue(
  bits: number,
  hover: boolean,
  mode: 'light' | 'dark',
  width: number,
  hovering: boolean,
): string | undefined {
  if (hover && hovering) return 'red';
  if (mode === 'dark' && MOBILE(width) && bits & 8) return 'silver';
  if (mode === 'dark' && bits & 4) return 'white';
  if (MOBILE(width) && bits & 2) return 'gray';
  if (bits & 1) return 'black';
  return undefined;
}

describe('the precedence matrix (group M: every combination of base, mobile, dark, dark+mobile)', () => {
  it.each(Array.from({ length: 16 }, (_v, bits) => bits))('combination %i', (bits) => {
    const id = `el-m${String(bits).padStart(2, '0')}`;
    for (const mode of ['light', 'dark'] as const) {
      for (const theme of THEMES) {
        for (const width of WIDTHS) {
          expect(
            resolve(css, 'color', context(id, mode, theme, width)),
            `${id} ${mode} ${theme} ${String(width)}`,
          ).toBe(matrixValue(bits, false, mode, width, false));
        }
      }
    }
  });
});

describe('group S: a hover rule beats every layer, for every combination', () => {
  it.each(Array.from({ length: 16 }, (_v, bits) => bits))('combination %i', (bits) => {
    const id = `el-s${String(bits).padStart(2, '0')}`;
    for (const mode of ['light', 'dark'] as const) {
      for (const theme of THEMES) {
        for (const width of WIDTHS) {
          for (const hovering of [false, true]) {
            const ctx = { ...context(id, mode, theme, width), states: hovering ? ['hover'] : [] };
            expect(resolve(css, 'color', ctx), `${id} ${mode} ${theme} ${String(width)} ${String(hovering)}`).toBe(
              matrixValue(bits, true, mode, width, hovering),
            );
          }
        }
      }
    }
  });
});

describe('group C: global classes against element rules (origin first, then layer, then the order of the class list)', () => {
  // cls-a (order 1): base olive, mobile maroon. cls-b (order 2): base purple, dark pink.
  const expectations: Record<string, (mode: 'light' | 'dark', mobile: boolean) => string> = {
    'el-c0': (_mode, mobile) => (mobile ? 'maroon' : 'olive'),
    // classIds order is presentation only: cls-b is later in the list, so it wins the base layer; a layer beats the base layer
    'el-c1': (mode, mobile) => (mode === 'dark' ? 'pink' : mobile ? 'maroon' : 'purple'),
    // an element rule beats every class rule, even a class rule in a more specific layer
    'el-c2': () => 'navy',
    'el-c3': (mode) => (mode === 'dark' ? 'teal' : 'purple'),
  };
  it.each(Object.keys(expectations))('%s', (id) => {
    for (const mode of ['light', 'dark'] as const) {
      for (const theme of THEMES) {
        for (const width of WIDTHS) {
          expect(
            resolve(css, 'color', context(id, mode, theme, width)),
            `${id} ${mode} ${theme} ${String(width)}`,
          ).toBe(expectations[id]?.(mode, MOBILE(width)));
        }
      }
    }
  });
});

describe('deterministic output', () => {
  it('does not depend on the order of the elements, on repetition, or on the order of object keys', () => {
    const reversed = { ...document, root: [...document.root].reverse() };
    expect(compile({ ...input, document: reversed }).css).toBe(result.css);
    expect(compile({ ...input, document }).css).toBe(result.css);
    const shuffledKeys = JSON.parse(
      JSON.stringify(document, (_k, v: unknown) =>
        v !== null && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).reverse()) : v,
      ),
    ) as typeof document;
    expect(compile({ ...input, document: shuffledKeys }).css).toBe(result.css);
  });

  it('every selector has specificity (0,1,0) and the stylesheet only uses the layers the matrix needs', () => {
    expect(result.issues).toEqual([]);
    const layers = new Set(css.rules.map((r) => css.layers[r.layer]));
    expect([...layers].sort()).toEqual([
      'blx.class.s0.base',
      'blx.class.s0.bp',
      'blx.class.s0.mode',
      'blx.el.hover.base',
      'blx.el.s0.base',
      'blx.el.s0.bp',
      'blx.el.s0.mode',
      'blx.el.s0.modebp',
    ]);
  });
});
