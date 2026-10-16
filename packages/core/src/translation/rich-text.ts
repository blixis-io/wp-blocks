import { isWellFormed } from '../json/well-formed.ts';
import { isSafeUrl } from './safe-url.ts';

export const RICH_TEXT_LIMITS = {
  maxNodes: 5000,
  maxCharacters: 20_000,
  maxMarks: 8,
  maxHrefLength: 2048,
  maxTokenIdLength: 64,
} as const;
export type Mark =
  | 'strong'
  | 'em'
  | 'u'
  | 's'
  | 'code'
  | { link: { href: string; newTab?: boolean } }
  | { style: { color?: string; highlight?: string; weight?: 'normal' | 'medium' | 'bold' } };
export type Inline = { t: 'text'; s: string; m?: Mark[] } | { t: 'br' };
export interface RichText {
  v: 1;
  inline: Inline[];
}
export type RichTextIssueCode =
  | 'rich-invalid-type'
  | 'rich-too-many-nodes'
  | 'rich-too-many-characters'
  | 'rich-too-many-marks'
  | 'rich-empty-text'
  | 'rich-invalid-utf8'
  | 'rich-control-character'
  | 'rich-invalid-mark'
  | 'rich-unsafe-url'
  | 'rich-unknown-token';
export type RichTextResult = { ok: true; value: RichText } | { ok: false; code: RichTextIssueCode };
const MARK_ORDER = ['link', 'style', 'strong', 'em', 'u', 's', 'code'] as const;

function hasForbiddenTextControl(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if ((code <= 0x1f && code !== 0x0a) || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

function characterCount(value: string): number {
  let count = 0;
  for (const char of value) count += (char.codePointAt(0) ?? 0) <= 0x10ffff ? 1 : 0;
  return count;
}
const compareCodePoints = (a: string, b: string): number => {
  const left = Array.from(a, (char) => char.codePointAt(0) ?? 0);
  const right = Array.from(b, (char) => char.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return left.length - right.length;
};

function validMark(mark: unknown, tokens?: ReadonlySet<string>): mark is Mark {
  if (typeof mark === 'string') return ['strong', 'em', 'u', 's', 'code'].includes(mark);
  if (mark === null || typeof mark !== 'object' || Array.isArray(mark)) return false;
  const keys = Object.keys(mark);
  if (keys.length !== 1) return false;
  if (keys[0] === 'link') {
    const link = (mark as { link?: unknown }).link;
    return (
      link !== null &&
      typeof link === 'object' &&
      !Array.isArray(link) &&
      Object.keys(link).every((key) => key === 'href' || key === 'newTab') &&
      typeof (link as { href?: unknown }).href === 'string' &&
      (link as { href: string }).href.length > 0 &&
      (link as { href: string }).href.length <= RICH_TEXT_LIMITS.maxHrefLength &&
      isSafeUrl((link as { href: string }).href) &&
      ((link as { newTab?: unknown }).newTab === undefined ||
        typeof (link as { newTab?: unknown }).newTab === 'boolean')
    );
  }
  if (keys[0] === 'style') {
    const style = (mark as { style?: unknown }).style;
    if (style === null || typeof style !== 'object' || Array.isArray(style)) return false;
    const entries = Object.entries(style as Record<string, unknown>);
    return (
      entries.length > 0 &&
      entries.every(([key, value]) =>
        key === 'weight'
          ? typeof value === 'string' && ['normal', 'medium', 'bold'].includes(value)
          : (key === 'color' || key === 'highlight') &&
            typeof value === 'string' &&
            /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(value) &&
            value.length <= RICH_TEXT_LIMITS.maxTokenIdLength &&
            (tokens === undefined || tokens.has(value)),
      )
    );
  }
  return false;
}

const markKey = (mark: Mark): string => JSON.stringify(mark);
const order = (mark: Mark): number =>
  MARK_ORDER.indexOf(typeof mark === 'string' ? mark : 'link' in mark ? 'link' : 'style');
const markGroup = (mark: Mark): string => (typeof mark === 'string' ? mark : 'link' in mark ? 'link' : 'style');

export function validateRichText(input: unknown, tokens?: ReadonlySet<string>): RichTextResult {
  if (input === null || typeof input !== 'object' || Array.isArray(input))
    return { ok: false, code: 'rich-invalid-type' };
  const value = input as Record<string, unknown>;
  if (
    Object.keys(value).length !== 2 ||
    !Object.hasOwn(value, 'v') ||
    !Object.hasOwn(value, 'inline') ||
    value['v'] !== 1 ||
    !Array.isArray(value['inline'])
  )
    return { ok: false, code: 'rich-invalid-type' };
  if (value['inline'].length > RICH_TEXT_LIMITS.maxNodes) return { ok: false, code: 'rich-too-many-nodes' };
  let characters = 0;
  const inline: Inline[] = [];
  for (const raw of value['inline']) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, code: 'rich-invalid-type' };
    const node = raw as Record<string, unknown>;
    if (node['t'] === 'br' && Object.keys(node).length === 1) {
      inline.push({ t: 'br' });
      continue;
    }
    if (
      node['t'] !== 'text' ||
      typeof node['s'] !== 'string' ||
      Object.keys(node).some((key) => !['t', 's', 'm'].includes(key))
    )
      return { ok: false, code: 'rich-invalid-type' };
    if (node['s'].length === 0) return { ok: false, code: 'rich-empty-text' };
    if (node['s'].includes('\n')) return { ok: false, code: 'rich-control-character' };
    if (!isWellFormed(node['s'])) return { ok: false, code: 'rich-invalid-utf8' };
    if (hasForbiddenTextControl(node['s'])) return { ok: false, code: 'rich-control-character' };
    characters += characterCount(node['s']);
    if (characters > RICH_TEXT_LIMITS.maxCharacters) return { ok: false, code: 'rich-too-many-characters' };
    if (node['m'] !== undefined && !Array.isArray(node['m'])) return { ok: false, code: 'rich-invalid-mark' };
    const marks = (node['m'] ?? []) as unknown[];
    if (marks.length > RICH_TEXT_LIMITS.maxMarks) return { ok: false, code: 'rich-too-many-marks' };
    if (tokens !== undefined && marks.some((mark) => hasUnknownToken(mark, tokens)))
      return { ok: false, code: 'rich-unknown-token' };
    if (!marks.every((mark) => validMark(mark, tokens))) return { ok: false, code: 'rich-invalid-mark' };
    const unique = [...new Map(marks.map((mark) => [markKey(mark), mark])).values()].sort(
      (a, b) => order(a) - order(b) || compareCodePoints(markKey(a), markKey(b)),
    );
    if (unique.filter((mark) => markGroup(mark) === 'link').length > 1) return { ok: false, code: 'rich-invalid-mark' };
    inline.push(unique.length ? { t: 'text', s: node['s'], m: unique } : { t: 'text', s: node['s'] });
  }
  if (inline.length > RICH_TEXT_LIMITS.maxNodes) return { ok: false, code: 'rich-too-many-nodes' };
  return { ok: true, value: { v: 1, inline } };
}

function hasUnknownToken(mark: unknown, tokens: ReadonlySet<string>): boolean {
  if (mark === null || typeof mark !== 'object' || Array.isArray(mark) || !('style' in mark)) return false;
  const style = (mark as { style?: unknown }).style;
  if (style === null || typeof style !== 'object' || Array.isArray(style)) return false;
  const record = style as Record<string, unknown>;
  return ['color', 'highlight'].some((key) => typeof record[key] === 'string' && !tokens.has(record[key]));
}

export const richToPlain = (value: RichText): string =>
  value.inline.map((node) => (node.t === 'br' ? '\n' : node.s)).join('');
export const plainToRich = (value: string): RichText => ({
  v: 1,
  inline: value
    .split('\n')
    .flatMap((line, index, lines) => [
      ...(line ? [{ t: 'text' as const, s: line }] : []),
      ...(index < lines.length - 1 ? [{ t: 'br' as const }] : []),
    ]),
});
export function normalizeRich(value: RichText): RichText {
  const out: Inline[] = [];
  for (const node of value.inline) {
    if (node.t === 'br') {
      out.push(node);
      continue;
    }
    if (node.s === '') continue;
    const marks = [...(node.m ?? [])].sort((a, b) => order(a) - order(b) || compareCodePoints(markKey(a), markKey(b)));
    const previous = out.at(-1);
    if (previous?.t === 'text' && JSON.stringify(previous.m ?? []) === JSON.stringify(marks)) previous.s += node.s;
    else out.push(marks.length ? { t: 'text', s: node.s, m: marks } : { t: 'text', s: node.s });
  }
  return { v: 1, inline: out };
}
export const richEquals = (a: RichText, b: RichText): boolean =>
  JSON.stringify(normalizeRich(a)) === JSON.stringify(normalizeRich(b));
export const markCount = (value: RichText): number =>
  value.inline.reduce((count, node) => count + (node.t === 'text' ? (node.m?.length ?? 0) : 0), 0);
