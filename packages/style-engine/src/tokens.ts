import { admitValue } from '@blixis/wp-core';
import {
  checkTokenSet,
  resolveTokens,
  tokenProperty,
  TokenSetSchema,
  type TokenCategory,
  type TokenIssueCode,
  type TokenSet,
} from '@blixis/wp-design-tokens';
import type { TokenValue } from './compile.ts';
import { parseValue } from './tokenize.ts';
import { validateDeclaration } from './validate.ts';

/** The CSS property whose value grammar a token of each category must satisfy. */
export const TOKEN_GRAMMAR: Readonly<Record<TokenCategory, string>> = {
  color: 'color',
  'font-family': 'font-family',
  'font-size': 'font-size',
  spacing: 'row-gap',
  radius: 'border-top-left-radius',
  container: 'max-width',
  shadow: 'box-shadow',
};

export type TokenSetIssueCode =
  | TokenIssueCode
  | 'unreadable'
  | 'reserved-key'
  | 'schema'
  | 'invalid-value'
  | 'invalid-resolved-value'
  | 'category-mismatch';

export interface TokenSetIssue {
  code: TokenSetIssueCode;
  path: string;
  message: string;
}

declare const validated: unique symbol;
/** A token set that passed `validateTokenSet`; the only kind `tokensForCompile` accepts. */
export type ValidatedTokenSet = TokenSet & { readonly [validated]: true };

export type TokenSetResult = { ok: true; set: ValidatedTokenSet } | { ok: false; issues: TokenSetIssue[] };

const TOKEN_REFERENCE = /^--blx-([a-z0-9]+(?:-[a-z0-9]+)*)$/;

/** The token a value is an alias of: the value is exactly one `var(--blx-name)` (with or without a fallback). */
function aliasTarget(value: string): string | undefined {
  const parsed = parseValue(value, { strings: true });
  const only = parsed.ok && parsed.components.length === 1 ? parsed.components[0] : undefined;
  const name = only?.t === 'fn' && only.name === 'var' ? only.children[0] : undefined;
  return name?.t === 'ident' ? TOKEN_REFERENCE.exec(name.v)?.[1] : undefined;
}
const MAX_ISSUES = 50;

/**
 * Validates untrusted token-set input end to end: an inert bounded copy (no getters, Proxies or reserved keys), the shape
 * (`TokenSetSchema`), every value (and dark value) against the CSS grammar of its category, then whole-set rules: unique
 * names, references that exist, no cycles in either mode, an alias that points at a token of the same category, and every
 * value still valid for its category after its references are substituted (both modes).
 * Nothing throws; at most 50 issues are reported.
 */
export function validateTokenSet(input: unknown): TokenSetResult {
  const admitted = admitValue(input);
  if (!admitted.ok) {
    return {
      ok: false,
      issues: admitted.issues.slice(0, MAX_ISSUES).map((i) => ({
        code: i.code === 'reserved-key' ? ('reserved-key' as const) : ('unreadable' as const),
        path: i.path,
        message: i.message,
      })),
    };
  }
  const parsed = TokenSetSchema.safeParse(admitted.value);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.slice(0, MAX_ISSUES).map((i) => ({
        code: 'schema' as const,
        path: ['$', ...i.path.map(String)].join('.'),
        message: i.message,
      })),
    };
  }
  const set = parsed.data;
  const issues: TokenSetIssue[] = [];
  const failed = new Set<string>();
  const byName = new Map(set.tokens.map((token) => [token.name, token] as const));
  set.tokens.forEach((token, index) => {
    for (const field of ['value', 'dark'] as const) {
      const value = token[field];
      if (value === undefined) continue;
      const path = `tokens[${String(index)}].${field}`;
      const result = validateDeclaration(TOKEN_GRAMMAR[token.category], value);
      if (!result.ok) {
        failed.add(path);
        issues.push({ code: 'invalid-value', path, message: `${result.code}: ${result.message}` });
        continue;
      }
      const target = byName.get(aliasTarget(value) ?? '');
      if (target !== undefined && target.category !== token.category) {
        issues.push({
          code: 'category-mismatch',
          path,
          message: `${token.name} (${token.category}) refers to ${target.name}, which is ${target.category}`,
        });
      }
    }
  });
  issues.push(...checkTokenSet(set));
  // What a token finally becomes after its references are substituted must still fit its category, in both modes
  // (`rgb(var(--blx-space) 0 0)` is fine as text and wrong once `--blx-space` is `1rem`).
  for (const mode of ['light', 'dark'] as const) {
    const { values } = resolveTokens(set, mode);
    set.tokens.forEach((token, index) => {
      const field = mode === 'dark' && token.dark !== undefined ? 'dark' : 'value';
      const path = `tokens[${String(index)}].${field}`;
      const resolved = values.get(token.name);
      if (resolved === undefined || failed.has(path) || (mode === 'dark' && field === 'value')) return;
      const result = validateDeclaration(TOKEN_GRAMMAR[token.category], resolved);
      if (!result.ok) {
        failed.add(path);
        issues.push({ code: 'invalid-resolved-value', path, message: `${result.code}: ${result.message}` });
      }
    });
  }
  return issues.length === 0
    ? { ok: true, set: set as ValidatedTokenSet }
    : { ok: false, issues: issues.slice(0, MAX_ISSUES) };
}

/**
 * The compiler's token input for a validated set: `--blx-<name>` with the base value, plus a dark-mode value where the
 * token has a dark value that differs from the base value (modes are sparse). References stay as `var(--blx-x)`; CSS resolves them, so a changed alias target updates its users.
 */
export function tokensForCompile(set: ValidatedTokenSet): TokenValue[] {
  const out: TokenValue[] = [];
  for (const token of set.tokens) {
    out.push({ name: tokenProperty(token.name), value: token.value, category: token.category });
    // Modes are sparse: a dark value equal to the base value says nothing and is not emitted.
    if (token.dark !== undefined && token.dark !== token.value) {
      out.push({ name: tokenProperty(token.name), value: token.dark, mode: 'dark', category: token.category });
    }
  }
  return out;
}
