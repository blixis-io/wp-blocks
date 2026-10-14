import { TOKEN_LIMITS, tokenValueFor, type Mode, type Token, type TokenSet } from './schema.ts';

export type TokenIssueCode =
  | 'duplicate-name'
  | 'unknown-reference'
  | 'invalid-reference'
  | 'reference-cycle'
  | 'reference-too-deep'
  | 'expansion-too-large';

export interface TokenIssue {
  code: TokenIssueCode;
  /** Path into the token set, for example `tokens[3].dark`. */
  path: string;
  message: string;
}

const MAX_DEPTH = 16;
const MAX_EXPANDED = 8192;
const REFERENCE = /^\s*--blx-([a-z0-9]+(?:-[a-z0-9]+)*)\s*(?:,([\s\S]*))?$/;

interface VarCall {
  start: number;
  end: number;
  inner: string;
}

/** The outermost `var(...)` calls of a CSS value, with their inner text. Unbalanced input yields what was found so far. */
function varCalls(text: string): VarCall[] {
  const calls: VarCall[] = [];
  let from = 0;
  for (;;) {
    const start = text.indexOf('var(', from);
    if (start < 0) return calls;
    let depth = 0;
    let end = -1;
    for (let i = start + 3; i < text.length; i += 1) {
      const c = text[i];
      if (c === '(') depth += 1;
      else if (c === ')') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end < 0) return calls;
    calls.push({ start, end, inner: text.slice(start + 4, end) });
    from = end + 1;
  }
}

/**
 * Names of the tokens a value references with `var(--blx-name)` (also inside fallbacks), in order of appearance, without
 * duplicates. References to anything else are not tokens and are ignored here.
 */
export function referencesIn(value: string, depth = 0): string[] {
  const names: string[] = [];
  if (depth > MAX_DEPTH) return names;
  for (const call of varCalls(value)) {
    const m = REFERENCE.exec(call.inner);
    const name = m?.[1];
    if (m === null || name === undefined) continue;
    if (!names.includes(name)) names.push(name);
    if (m[2] !== undefined) {
      for (const inner of referencesIn(m[2], depth + 1)) if (!names.includes(inner)) names.push(inner);
    }
  }
  return names;
}

type Expansion = { ok: true; value: string } | { ok: false; code: TokenIssueCode; message: string };

/**
 * Resolves every token of a set for one mode: `var(--blx-x)` references are replaced by the referenced token's own
 * resolved value (alias chains, composite values, fallbacks). Unknown references without a fallback, cycles, chains deeper
 * than 16 and expansions larger than 8 KiB are reported per token and that token is left out of `values`.
 */
export function resolveTokens(
  set: Pick<TokenSet, 'tokens'>,
  mode: Mode,
): { values: Map<string, string>; issues: TokenIssue[] } {
  const byName = new Map<string, { token: Token; index: number }>();
  set.tokens.forEach((token, index) => {
    if (!byName.has(token.name)) byName.set(token.name, { token, index });
  });
  const memo = new Map<string, Expansion>();

  const expand = (text: string, stack: readonly string[]): Expansion => {
    let out = '';
    let cursor = 0;
    for (const call of varCalls(text)) {
      out += text.slice(cursor, call.start);
      cursor = call.end + 1;
      const m = REFERENCE.exec(call.inner);
      if (m === null)
        return { ok: false, code: 'invalid-reference', message: `"var(${call.inner})" is not a token reference` };
      const name = m[1] ?? '';
      const target = byName.get(name);
      if (target !== undefined) {
        const resolved = resolve(name, stack);
        if (!resolved.ok) return resolved;
        out += resolved.value;
      } else if (m[2] !== undefined) {
        const fallback = expand(m[2].trim(), stack);
        if (!fallback.ok) return fallback;
        out += fallback.value;
      } else {
        return { ok: false, code: 'unknown-reference', message: `the token "${name}" does not exist` };
      }
    }
    out += text.slice(cursor);
    return out.length > MAX_EXPANDED
      ? {
          ok: false,
          code: 'expansion-too-large',
          message: `the resolved value is longer than ${String(MAX_EXPANDED)} characters`,
        }
      : { ok: true, value: out };
  };

  const resolve = (name: string, stack: readonly string[]): Expansion => {
    const cached = memo.get(name);
    if (cached !== undefined) return cached;
    if (stack.includes(name)) {
      return { ok: false, code: 'reference-cycle', message: `${[...stack, name].join(' -> ')} refers back to itself` };
    }
    if (stack.length >= MAX_DEPTH) {
      return {
        ok: false,
        code: 'reference-too-deep',
        message: `references are nested deeper than ${String(MAX_DEPTH)} levels`,
      };
    }
    const entry = byName.get(name);
    if (entry === undefined)
      return { ok: false, code: 'unknown-reference', message: `the token "${name}" does not exist` };
    const result = expand(tokenValueFor(entry.token, mode), [...stack, name]);
    // A cycle is only a property of the chain being walked, so failures that depend on the path are not cached.
    if (result.ok || result.code !== 'reference-cycle') memo.set(name, result);
    return result;
  };

  const values = new Map<string, string>();
  const issues: TokenIssue[] = [];
  for (const [name, { index }] of byName) {
    const result = resolve(name, []);
    if (result.ok) values.set(name, result.value);
    else {
      const field = mode === 'dark' && byName.get(name)?.token.dark !== undefined ? 'dark' : 'value';
      issues.push({ code: result.code, path: `tokens[${String(index)}].${field}`, message: result.message });
    }
  }
  return { values, issues };
}

/**
 * Whole-set checks that the per-token schema cannot express: unique names, and references that exist and do not cycle in
 * either mode. Limits are applied by the schema; this function is bounded by them (500 tokens, 16 levels).
 */
export function checkTokenSet(set: Pick<TokenSet, 'tokens'>): TokenIssue[] {
  const issues: TokenIssue[] = [];
  const seen = new Set<string>();
  set.tokens.forEach((token, index) => {
    if (seen.has(token.name)) {
      issues.push({
        code: 'duplicate-name',
        path: `tokens[${String(index)}].name`,
        message: `the name "${token.name}" is used twice`,
      });
    }
    seen.add(token.name);
  });
  const reported = new Set<string>();
  for (const mode of ['light', 'dark'] as const) {
    for (const issue of resolveTokens(set, mode).issues) {
      const key = `${issue.code}|${issue.path}`;
      if (!reported.has(key)) {
        reported.add(key);
        issues.push(issue);
      }
    }
  }
  return issues;
}

/** One token's resolved value in a mode, or the reason it cannot be resolved. */
export function resolveToken(
  set: Pick<TokenSet, 'tokens'>,
  name: string,
  mode: Mode,
): { ok: true; value: string } | { ok: false; issue: TokenIssue } {
  const { values, issues } = resolveTokens(set, mode);
  const value = values.get(name);
  if (value !== undefined) return { ok: true, value };
  const index = set.tokens.findIndex((t) => t.name === name);
  const found = issues.find((i) => i.path.startsWith(`tokens[${String(index)}].`));
  return {
    ok: false,
    issue: found ?? { code: 'unknown-reference', path: 'tokens', message: `the token "${name}" does not exist` },
  };
}

export { TOKEN_LIMITS };
