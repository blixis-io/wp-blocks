import { admitValue } from '@blixis/wp-core';
import {
  checkTokenSet,
  tokenProperty,
  TokenSetSchema,
  type TokenCategory,
  type TokenIssueCode,
  type TokenSet,
} from '@blixis/wp-design-tokens';
import type { TokenValue } from './compile.ts';
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
  TokenIssueCode | 'unreadable' | 'reserved-key' | 'schema' | 'invalid-value' | 'category-mismatch';

export interface TokenSetIssue {
  code: TokenSetIssueCode;
  path: string;
  message: string;
}

export type TokenSetResult = { ok: true; set: TokenSet } | { ok: false; issues: TokenSetIssue[] };

const LONE_ALIAS = /^var\(--blx-([a-z0-9]+(?:-[a-z0-9]+)*)\)$/;
const MAX_ISSUES = 50;

/**
 * Validates untrusted token-set input end to end: an inert bounded copy (no getters, Proxies or reserved keys), the shape
 * (`TokenSetSchema`), every value (and dark value) against the CSS grammar of its category, then whole-set rules: unique
 * names, references that exist, no cycles in either mode, and an alias that points at a token of the same category.
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
  const byName = new Map(set.tokens.map((token) => [token.name, token] as const));
  set.tokens.forEach((token, index) => {
    for (const field of ['value', 'dark'] as const) {
      const value = token[field];
      if (value === undefined) continue;
      const path = `tokens[${String(index)}].${field}`;
      const result = validateDeclaration(TOKEN_GRAMMAR[token.category], value);
      if (!result.ok) {
        issues.push({ code: 'invalid-value', path, message: `${result.code}: ${result.message}` });
        continue;
      }
      const alias = LONE_ALIAS.exec(value.trim());
      const target = alias === null ? undefined : byName.get(alias[1] ?? '');
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
  return issues.length === 0 ? { ok: true, set } : { ok: false, issues: issues.slice(0, MAX_ISSUES) };
}

/**
 * The compiler's token input for a validated set: `--blx-<name>` with the base value, plus a dark-mode value where the
 * token has one. References stay as `var(--blx-x)`; CSS resolves them, so a changed alias target updates its users.
 */
export function tokensForCompile(set: TokenSet): TokenValue[] {
  const out: TokenValue[] = [];
  for (const token of set.tokens) {
    out.push({ name: tokenProperty(token.name), value: token.value });
    if (token.dark !== undefined) out.push({ name: tokenProperty(token.name), value: token.dark, mode: 'dark' });
  }
  return out;
}
