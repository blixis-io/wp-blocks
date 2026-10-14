import { duplicateNameIssues, resolveTokens, type TokenIssue } from './graph.ts';
import type { Token, TokenSet } from './schema.ts';

export interface ModeResolution {
  /** Every token that resolves, per mode: references substituted, dark overrides applied. */
  light: Map<string, string>;
  dark: Map<string, string>;
  /** Problems found in either mode, once per path and code. */
  issues: TokenIssue[];
  /** Tokens that set their own dark value and whose dark value differs from the light one (the sparse overrides). */
  overrides: string[];
  /** Tokens whose resolved value differs between the modes, including aliases and composites that follow an override. */
  differing: string[];
}

/**
 * Computes a token set for both appearance modes in one call. Modes are sparse (ADR 0005): a token without a dark value is
 * the same in both modes, and an alias or composite follows whatever its targets do, so one override in `brand` changes
 * every token built on it without a second copy of anything. Nothing here touches documents: elements are the same in both
 * modes and only the values of the custom properties differ.
 */
export function resolveModes(set: Pick<TokenSet, 'tokens'>): ModeResolution {
  const light = resolveTokens(set, 'light');
  const dark = resolveTokens(set, 'dark');
  const seen = new Set<string>();
  const issues: TokenIssue[] = [];
  for (const issue of [...duplicateNameIssues(set), ...light.issues, ...dark.issues]) {
    const key = `${issue.code}|${issue.path}`;
    if (!seen.has(key)) {
      seen.add(key);
      issues.push(issue);
    }
  }
  // Only the first definition of a name counts (a later duplicate is reported and ignored).
  const first = new Map<string, Token>();
  for (const token of set.tokens) if (!first.has(token.name)) first.set(token.name, token);
  const overrides = [...first.values()].filter((t) => t.dark !== undefined && t.dark !== t.value).map((t) => t.name);
  const differing = [...light.values.keys()].filter(
    (name) => dark.values.has(name) && dark.values.get(name) !== light.values.get(name),
  );
  return { light: light.values, dark: dark.values, issues, overrides, differing };
}

/** The tokens with redundant dark values removed (a dark value equal to the base value says nothing). Order is kept. */
export function sparseTokens<T extends Pick<Token, 'value' | 'dark'>>(tokens: readonly T[]): T[] {
  return tokens.map((token) => {
    if (token.dark === undefined || token.dark !== token.value) return token;
    const rest: Partial<T> = { ...token };
    Reflect.deleteProperty(rest, 'dark');
    return rest as T;
  });
}
