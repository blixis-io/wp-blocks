/** A tiny CSS block walker for the style-isolation test (minified or pretty output, no @import support needed). */
export interface Violation {
  selector: string;
  context: string;
}

const ALLOWED_AT_RULES = new Set(['keyframes', 'property']);
const NESTING_AT_RULES = new Set(['layer', 'media', 'supports']);
const ALLOWED_LAYERS = new Set(['blx-editor']);

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

export function splitSelectors(prelude: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of prelude) {
    if (char === '(' || char === '[') depth++;
    if (char === ')' || char === ']') depth--;
    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else current += char;
  }
  if (current.trim() !== '') parts.push(current.trim());
  return parts;
}

function readBlocks(css: string): { prelude: string; body: string | null }[] {
  const blocks: { prelude: string; body: string | null }[] = [];
  let index = 0;
  while (index < css.length) {
    let prelude = '';
    while (index < css.length && css[index] !== '{' && css[index] !== ';') prelude += css.charAt(index++);
    if (css[index] === ';' || index >= css.length) {
      if (prelude.trim() !== '') blocks.push({ prelude: prelude.trim(), body: null });
      index++;
      continue;
    }
    let depth = 0;
    const start = index + 1;
    for (; index < css.length; index++) {
      if (css[index] === '{') depth++;
      else if (css[index] === '}' && --depth === 0) break;
    }
    blocks.push({ prelude: prelude.trim(), body: css.slice(start, index) });
    index++;
  }
  return blocks;
}

/** Returns every selector that is not scoped under `.blx-editor`, and every at-rule that is not allowed. */
export function findScopeViolations(css: string, scope = '.blx-editor', context = ''): Violation[] {
  const violations: Violation[] = [];
  for (const { prelude, body } of readBlocks(stripComments(css))) {
    if (prelude.startsWith('@')) {
      const match = /^@([a-z-]+)\s*(.*)$/s.exec(prelude);
      const name = match?.[1] ?? '';
      const argument = match?.[2]?.trim() ?? '';
      if (name === 'layer') {
        const names = argument
          .split(',')
          .map((n) => n.trim())
          .filter((n) => n !== '');
        if (names.some((n) => !ALLOWED_LAYERS.has(n))) violations.push({ selector: prelude, context });
      }
      if (body === null) continue;
      if (ALLOWED_AT_RULES.has(name)) continue;
      if (NESTING_AT_RULES.has(name)) violations.push(...findScopeViolations(body, scope, `${context}${prelude} > `));
      else violations.push({ selector: prelude, context });
      continue;
    }
    for (const selector of splitSelectors(prelude)) {
      const scoped = selector === scope || new RegExp(`^${scope.replace('.', '\\.')}(?![A-Za-z0-9_-])`).test(selector);
      if (!scoped) violations.push({ selector, context });
    }
  }
  return violations;
}
