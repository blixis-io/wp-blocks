import { matchesProperty, checkCustomValue, checkFunctions } from './grammar.ts';
import { CSS_LIMITS, type CssFailure, type CssIssueCode } from './limits.ts';
import { PROPERTIES } from './properties.ts';
import { parseValue, serialize } from './tokenize.ts';

export type DeclarationResult = { ok: true; name: string; value: string } | ({ ok: false } & CssFailure);

const CUSTOM_NAME = /^--blx-[a-z0-9-]{1,64}$/;
const fail = (code: CssIssueCode, message: string): DeclarationResult => ({ ok: false, code, message });

/**
 * Validates one declaration against the allow-list and returns its canonical form (`value` is lower-case with single
 * spaces; this is what the compiler emits). Never throws. Names are matched exactly and case-sensitively: only lower-case
 * property names are stored. Integers (the document stores whole numbers as numbers) are accepted and returned as text.
 */
export function validateDeclaration(name: string, value: string | number): DeclarationResult {
  const text = typeof value === 'number' ? (Number.isSafeInteger(value) ? String(value) : '') : value;
  const isCustom = name.startsWith('--');
  const kind = PROPERTIES.get(name);
  if (isCustom ? !CUSTOM_NAME.test(name) : kind === undefined) {
    return fail(
      isCustom ? 'invalid-name' : 'unknown-property',
      isCustom ? 'custom properties must be named --blx-*' : `"${name}" is not an allowed CSS property`,
    );
  }
  if (text.trim() === '') return fail('empty-value', 'the value is empty');
  if (text.length > CSS_LIMITS.maxValueLength)
    return fail('value-too-long', `longer than ${String(CSS_LIMITS.maxValueLength)} characters`);
  const parsed = parseValue(text, { strings: name === 'font-family' });
  if (!parsed.ok) return fail(parsed.code, parsed.message);
  const functions = checkFunctions(parsed.components);
  if (functions !== null) return fail(functions.code, functions.message);
  if (isCustom) {
    const custom = checkCustomValue(parsed.components);
    if (custom !== null) return fail(custom.code, custom.message);
  } else if (kind !== undefined && !matchesProperty(kind, parsed.components)) {
    return fail('invalid-value', `"${text.slice(0, 80)}" is not a valid value for ${name}`);
  }
  return { ok: true, name, value: serialize(parsed.components) };
}

export interface DeclarationIssue extends CssFailure {
  name: string;
}

/** Validates every declaration of a rule. Own properties only. */
export function validateDeclarations(declarations: Readonly<Record<string, string | number>>): DeclarationIssue[] {
  const issues: DeclarationIssue[] = [];
  for (const name of Object.keys(declarations)) {
    const raw = declarations[name];
    if (raw === undefined) continue;
    const result = validateDeclaration(name, raw);
    if (!result.ok) issues.push({ name, code: result.code, message: result.message });
  }
  return issues;
}

/**
 * The declarations that are valid, in canonical form and in name order. Invalid ones are dropped and reported. The compiler
 * must use this (never the raw rule), so even a document that skipped validation cannot inject CSS.
 */
export function sanitizeDeclarations(declarations: Readonly<Record<string, string | number>>): {
  declarations: Record<string, string>;
  issues: DeclarationIssue[];
} {
  const clean: Record<string, string> = {};
  const issues: DeclarationIssue[] = [];
  for (const name of Object.keys(declarations).sort()) {
    const raw = declarations[name];
    if (raw === undefined) continue;
    const result = validateDeclaration(name, raw);
    if (result.ok)
      Object.defineProperty(clean, name, { value: result.value, enumerable: true, writable: true, configurable: true });
    else issues.push({ name, code: result.code, message: result.message });
  }
  return { declarations: clean, issues };
}
