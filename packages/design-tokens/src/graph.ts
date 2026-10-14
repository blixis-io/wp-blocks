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

type Expansion = { ok: true; value: string; height: number } | { ok: false; code: TokenIssueCode; message: string };

/**
 * Resolves every token of a set for one mode: `var(--blx-x)` references are replaced by the referenced token's own
 * resolved value (alias chains, composite values, fallbacks). Unknown references without a fallback, reference cycles (a
 * token fails when it is on a cycle or depends on one), chains of more than 16 tokens and expansions larger than 8 KiB are
 * reported per token, and that token is left out of `values`.
 *
 * Every outcome depends only on the token and what it references, never on the order of the tokens or on which token is
 * resolved first: cycles are found up front on the whole graph and the rest is resolved bottom-up with memoization, so the
 * work is linear in the references.
 */
function analyze(set: Pick<TokenSet, 'tokens'>, mode: Mode) {
  const byName = new Map<string, { token: Token; index: number }>();
  set.tokens.forEach((token, index) => {
    if (!byName.has(token.name)) byName.set(token.name, { token, index });
  });
  const textOf = (name: string): string => tokenValueFor((byName.get(name) as { token: Token }).token, mode);

  // 1. Cycles: strongly connected components of the reference graph (Tarjan), then everything that reaches one.
  const edges = new Map<string, string[]>();
  for (const name of byName.keys())
    edges.set(
      name,
      referencesIn(textOf(name)).filter((n) => byName.has(n)),
    );
  const cyclic = new Map<string, string>(); // token -> message
  let counter = 0;
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const path: string[] = [];
  const visit = (name: string): void => {
    index.set(name, counter);
    low.set(name, counter);
    counter += 1;
    path.push(name);
    onStack.add(name);
    for (const next of edges.get(name) ?? []) {
      if (!index.has(next)) {
        visit(next);
        low.set(name, Math.min(low.get(name) ?? 0, low.get(next) ?? 0));
      } else if (onStack.has(next)) {
        low.set(name, Math.min(low.get(name) ?? 0, index.get(next) ?? 0));
      }
    }
    if (low.get(name) === index.get(name)) {
      const component: string[] = [];
      for (;;) {
        const member = path.pop();
        if (member === undefined) break;
        onStack.delete(member);
        component.push(member);
        if (member === name) break;
      }
      const selfLoop = component.length === 1 && (edges.get(name) ?? []).includes(name);
      if (component.length > 1 || selfLoop) {
        const members = component.sort((x, y) => (byName.get(x)?.index ?? 0) - (byName.get(y)?.index ?? 0));
        const message = `${members.join(', ')} ${members.length === 1 ? 'refers' : 'refer'} back to ${members.length === 1 ? 'itself' : 'each other'}`;
        for (const member of members) cyclic.set(member, message);
      }
    }
  };
  for (const name of byName.keys()) if (!index.has(name)) visit(name);
  const reaches = new Map<string, string | null>();
  const dependsOnCycle = (name: string): string | null => {
    const known = reaches.get(name);
    if (known !== undefined) return known;
    let result: string | null = cyclic.get(name) ?? null;
    if (result === null) {
      for (const next of edges.get(name) ?? []) {
        if (dependsOnCycle(next) !== null) {
          result = `depends on "${next}", which cannot be resolved because of a reference cycle`;
          break;
        }
      }
    }
    reaches.set(name, result);
    return result;
  };

  // 2. Everything else is acyclic: resolve bottom-up, memoized, tracking how many tokens deep each chain is.
  const memo = new Map<string, Expansion>();
  const expand = (text: string): Expansion => {
    let out = '';
    let cursor = 0;
    let height = 0;
    for (const call of varCalls(text)) {
      out += text.slice(cursor, call.start);
      cursor = call.end + 1;
      const m = REFERENCE.exec(call.inner);
      if (m === null)
        return { ok: false, code: 'invalid-reference', message: `"var(${call.inner})" is not a token reference` };
      const name = m[1] ?? '';
      let piece: Expansion;
      if (byName.has(name)) piece = resolve(name);
      else if (m[2] !== undefined) piece = expand(m[2].trim());
      else piece = { ok: false, code: 'unknown-reference', message: `the token "${name}" does not exist` };
      if (!piece.ok) return piece;
      out += piece.value;
      height = Math.max(height, piece.height);
    }
    out += text.slice(cursor);
    return out.length > MAX_EXPANDED
      ? {
          ok: false,
          code: 'expansion-too-large',
          message: `the resolved value is longer than ${String(MAX_EXPANDED)} characters`,
        }
      : { ok: true, value: out, height };
  };
  const resolve = (name: string): Expansion => {
    const cached = memo.get(name);
    if (cached !== undefined) return cached;
    const cycle = dependsOnCycle(name);
    if (cycle !== null) return { ok: false, code: 'reference-cycle', message: cycle };
    const inner = expand(textOf(name));
    const result: Expansion =
      inner.ok && inner.height + 1 > MAX_DEPTH
        ? {
            ok: false,
            code: 'reference-too-deep',
            message: `references are nested deeper than ${String(MAX_DEPTH)} levels`,
          }
        : inner.ok
          ? { ok: true, value: inner.value, height: inner.height + 1 }
          : inner;
    memo.set(name, result);
    return result;
  };

  return { byName, dependsOnCycle, resolve, expand };
}

export function resolveTokens(
  set: Pick<TokenSet, 'tokens'>,
  mode: Mode,
): { values: Map<string, string>; issues: TokenIssue[] } {
  const { byName, dependsOnCycle, resolve } = analyze(set, mode);
  const values = new Map<string, string>();
  const issues: TokenIssue[] = [];
  for (const [name, { index: position }] of byName) {
    const field = mode === 'dark' && byName.get(name)?.token.dark !== undefined ? 'dark' : 'value';
    const path = `tokens[${String(position)}].${field}`;
    const cycle = dependsOnCycle(name);
    if (cycle !== null) {
      issues.push({ code: 'reference-cycle', path, message: cycle });
      continue;
    }
    const result = resolve(name);
    if (result.ok) values.set(name, result.value);
    else issues.push({ code: result.code, path, message: result.message });
  }
  return { values, issues };
}

/** `duplicate-name` issues: a name used twice (the first definition is the one that counts). */
export function duplicateNameIssues(set: Pick<TokenSet, 'tokens'>): TokenIssue[] {
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
  return issues;
}

/**
 * Resolves a free-standing CSS value that may refer to tokens (an element's `color: var(--blx-color-text)`) for one mode,
 * without adding anything to the set: it counts toward depth only through the tokens it names. It does not check that the
 * text is a valid CSS value.
 */
export function resolveExpression(
  set: Pick<TokenSet, 'tokens'>,
  text: string,
  mode: Mode,
): { ok: true; value: string } | { ok: false; issue: TokenIssue } {
  const result = analyze(set, mode).expand(text);
  if (result.ok) return { ok: true, value: result.value };
  return { ok: false, issue: { code: result.code, path: 'value', message: result.message } };
}

/**
 * Whole-set checks that the per-token schema cannot express: unique names, and references that exist and do not cycle in
 * either mode. Limits are applied by the schema; this function is bounded by them (500 tokens, 16 levels).
 */
export function checkTokenSet(set: Pick<TokenSet, 'tokens'>): TokenIssue[] {
  const issues: TokenIssue[] = duplicateNameIssues(set);
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
