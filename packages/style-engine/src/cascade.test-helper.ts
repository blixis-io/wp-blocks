// A small cascade evaluator for the compiler's own output format, used by the conformance tests. It understands exactly the
// constructs the compiler emits (layers, nested @media, `.class` selectors with :where() scopes) and refuses anything else,
// so a change in the output format fails loudly. Real browser tests come with the editor canvas.
export interface Rule {
  layer: number;
  selector: string;
  decls: Record<string, string>;
  media: string[];
  order: number;
}

export interface Context {
  dataTheme: 'light' | 'dark' | 'auto' | undefined;
  system: 'light' | 'dark';
  width: number;
  states: string[];
  classes: string[];
}

const SELECTOR =
  /^(?:(:where\(html\[data-theme="(light|dark)"\]\))|(:where\(html:not\(\[data-theme="light"\]\):not\(\[data-theme="dark"\]\)\))) \.([a-z0-9-]+)(?::where\(:([a-z-]+)\))?$|^\.([a-z0-9-]+)(?::where\(:([a-z-]+)\))?$/;
const TOKEN_SELECTOR =
  /^(?::where\(:root\)|:where\(html\[data-theme="(light|dark)"\]\)|:where\(html:not\(\[data-theme="light"\]\):not\(\[data-theme="dark"\]\)\))$/;

function matchingBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error('unbalanced braces');
}

export function parse(css: string): { layers: string[]; rules: Rule[] } {
  const body = css.replace(/^\/\*[^*]*\*\//, '').trim();
  const layerStatement = /^@layer ([^{;]+);/.exec(body);
  if (layerStatement === null) throw new Error('missing @layer statement');
  const layers = (layerStatement[1] ?? '').split(',');
  const rules: Rule[] = [];
  let order = 0;
  const walk = (text: string, layer: number, media: string[]): void => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf('{', i);
      if (open < 0) break;
      const close = matchingBrace(text, open);
      const prelude = text.slice(i, open).trim();
      const inner = text.slice(open + 1, close);
      if (prelude.startsWith('@media ')) walk(inner, layer, [...media, prelude.slice(7)]);
      else {
        const decls: Record<string, string> = {};
        for (const part of inner.split(';')) {
          const colon = part.indexOf(':');
          if (colon > 0) decls[part.slice(0, colon)] = part.slice(colon + 1);
        }
        for (const selector of prelude.split(',')) {
          // A comma can also appear inside :where(); the compiler never emits one there.
          rules.push({ layer, selector, decls, media, order });
          order += 1;
        }
      }
      i = close + 1;
    }
  };
  let rest = body.slice(layerStatement[0].length);
  while (rest.trim() !== '') {
    rest = rest.trim();
    const open = rest.indexOf('{');
    const name = rest.slice(0, open).replace('@layer ', '').trim();
    const close = matchingBrace(rest, open);
    const index = layers.indexOf(name);
    if (index < 0) throw new Error(`layer ${name} is not declared`);
    walk(rest.slice(open + 1, close), index, []);
    rest = rest.slice(close + 1);
  }
  return { layers, rules };
}

function mediaMatches(query: string, ctx: Context): boolean {
  const max = /^\(max-width:(\d+)px\)$/.exec(query);
  if (max !== null) return ctx.width <= Number(max[1]);
  if (query === '(prefers-color-scheme:dark)') return ctx.system === 'dark';
  if (query === 'not all and (prefers-color-scheme:dark)') return ctx.system !== 'dark';
  throw new Error(`unsupported media query ${query}`);
}

function selectorMatches(selector: string, ctx: Context): boolean {
  const m = SELECTOR.exec(selector);
  if (m === null) throw new Error(`unexpected selector ${selector}`);
  const [, explicit, mode, auto, scopedClass, scopedState, plainClass, plainState] = m;
  const cls = scopedClass ?? plainClass ?? '';
  const state = scopedState ?? plainState;
  if (!ctx.classes.includes(cls)) return false;
  if (state !== undefined && !ctx.states.includes(state)) return false;
  if (explicit !== undefined) return ctx.dataTheme === mode;
  if (auto !== undefined) return ctx.dataTheme === undefined || ctx.dataTheme === 'auto';
  return true;
}

/** The winning value of `property` for an element carrying `ctx.classes`: layer order first, then later in the sheet. */
export function resolve(parsed: { rules: Rule[] }, property: string, ctx: Context): string | undefined {
  let best: Rule | undefined;
  for (const rule of parsed.rules) {
    if (rule.decls[property] === undefined) continue;
    if (!rule.media.every((q) => mediaMatches(q, ctx))) continue;
    if (!selectorMatches(rule.selector, ctx)) continue;
    if (best === undefined || rule.layer > best.layer || (rule.layer === best.layer && rule.order > best.order))
      best = rule;
  }
  return best?.decls[property];
}

/** Custom properties on the root for the given context (tokens). */
export function resolveRoot(parsed: { rules: Rule[] }, property: string, ctx: Context): string | undefined {
  let best: Rule | undefined;
  for (const rule of parsed.rules) {
    if (rule.decls[property] === undefined) continue;
    if (!TOKEN_SELECTOR.test(rule.selector)) continue;
    if (!rule.media.every((q) => mediaMatches(q, ctx))) continue;
    const explicit = /data-theme="(light|dark)"\]\)$/.exec(rule.selector);
    const auto = rule.selector.includes(':not(');
    if (explicit !== null && ctx.dataTheme !== explicit[1]) continue;
    if (auto && ctx.dataTheme !== undefined && ctx.dataTheme !== 'auto') continue;
    if (best === undefined || rule.layer > best.layer || (rule.layer === best.layer && rule.order > best.order))
      best = rule;
  }
  return best?.decls[property];
}

export { SELECTOR };
