/**
 * Defence in depth for the canvas runtime. The PHP preview route already sanitizes the HTML and the compiler only emits
 * safe CSS, but the runtime is the last gate before the text reaches the DOM, so it must not rely on either.
 */
import { LIMITS } from '@blixis/wp-canvas-bridge';

/** Elements that may never appear in a preview fragment (matched on the lower-case local name). */
export const FORBIDDEN_ELEMENTS: ReadonlySet<string> = new Set([
  'script',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'form',
  'link',
  'meta',
  'base',
  'style',
  'noscript',
  'template',
  'portal',
  'foreignobject',
  'use',
  'animate',
  'animatetransform',
  'animatemotion',
  'set',
  'math',
]);

/** Attributes whose value is a URL (or a list of them). */
const URL_ATTRIBUTES: ReadonlySet<string> = new Set([
  'href',
  'xlink:href',
  'src',
  'srcset',
  'action',
  'formaction',
  'poster',
  'background',
  'cite',
  'data',
  'longdesc',
  'ping',
  'manifest',
  'codebase',
]);

const ACTIVE_SCHEME = /^(?:javascript|data|vbscript|blob|file):/;
/** Whitespace and control characters that browsers ignore inside a URL scheme (`java\tscript:`). */
// eslint-disable-next-line no-control-regex
const URL_NOISE = /[\u0000- \u007f-\u009f]/g;

export const MAX_ELEMENTS = 50_000;

export type HtmlCheck = { ok: true; fragment: DocumentFragment } | { ok: false; code: 'unsafe-html' | 'too-large' };

const isActiveUrl = (value: string): boolean => ACTIVE_SCHEME.test(value.replace(URL_NOISE, '').toLowerCase());

/**
 * Parses `html` in an inert `<template>` (no script runs, nothing loads) and returns a fragment imported into `doc`, or
 * refuses the whole fragment. It never repairs: a repaired fragment could differ from what the server validated.
 */
export function checkHtml(html: string, doc: Document): HtmlCheck {
  if (html.length > LIMITS.htmlMax) return { ok: false, code: 'too-large' };
  const template = doc.createElement('template');
  template.innerHTML = html;
  const walker = doc.createTreeWalker(template.content, 1 /* NodeFilter.SHOW_ELEMENT */);
  let count = 0;
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    count += 1;
    if (count > MAX_ELEMENTS) return { ok: false, code: 'too-large' };
    const element = node as Element;
    if (FORBIDDEN_ELEMENTS.has(element.localName.toLowerCase())) return { ok: false, code: 'unsafe-html' };
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith('on') || name === 'srcdoc') return { ok: false, code: 'unsafe-html' };
      if (name === 'style' && !isCssSafe(attribute.value)) return { ok: false, code: 'unsafe-html' };
      if (URL_ATTRIBUTES.has(name)) {
        const candidates = name === 'srcset' ? attribute.value.split(',') : [attribute.value];
        if (candidates.some(isActiveUrl)) return { ok: false, code: 'unsafe-html' };
      }
    }
  }
  return { ok: true, fragment: doc.importNode(template.content, true) };
}

/* eslint-disable no-control-regex -- rejecting control characters is the point of this check */
const FORBIDDEN_CHARACTERS = new RegExp(
  '[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\ufeff\\ufff0-\\uffff]',
);
/* eslint-enable no-control-regex */
const FORBIDDEN_CSS = [
  /<\s*\/\s*style/,
  /<!--/,
  /@import/,
  /@charset/,
  /url\s*\(/,
  /expression\s*\(/,
  /image-set\s*\(/,
  /(?<![a-z-])src\s*\(/,
  /-moz-binding/,
  /behavior\s*:/,
  /javascript\s*:/,
];

/** Resolves CSS escapes (`\75 rl(`) so an obfuscated token cannot slip past the plain-text checks. */
function decodeCssEscapes(css: string): string {
  return css.replace(
    /\\(?:([0-9a-fA-F]{1,6})[ \t\r\n\f]?|([^\n\r\f0-9a-fA-F]))/g,
    (_match, hex?: string, other?: string) => {
      if (other !== undefined) return other;
      const code = Number.parseInt(hex ?? '0', 16);
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '�';
    },
  );
}

/** `true` when the CSS text may be put into the managed `<style>` element. */
export function isCssSafe(css: string): boolean {
  if (css.length > LIMITS.cssMax) return false;
  if (FORBIDDEN_CHARACTERS.test(css)) return false;
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const variant of [css, withoutComments, decodeCssEscapes(withoutComments)]) {
    const lower = variant.toLowerCase();
    if (FORBIDDEN_CSS.some((pattern) => pattern.test(lower))) return false;
  }
  return true;
}
