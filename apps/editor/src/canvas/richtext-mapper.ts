import {
  isSafeUrl,
  normalizeRich,
  plainToRich,
  richToPlain,
  validateRichText,
  type Mark,
  type RichText,
} from '@blixis/wp-core';

interface JsonNode {
  type?: unknown;
  text?: unknown;
  marks?: unknown;
  content?: unknown;
  attrs?: unknown;
}
const SIMPLE: Record<string, Mark> = { bold: 'strong', italic: 'em', underline: 'u', strike: 's', code: 'code' };

/** Converts only the ADR 0014 inline whitelist. Hostile/unknown ProseMirror data is discarded. */
export function toModel(pmJson: unknown, tokens?: ReadonlySet<string>): RichText | string {
  const doc = pmJson as JsonNode | null;
  if (!doc?.type || doc.type !== 'doc' || !Array.isArray(doc.content) || doc.content.length > 5_000) return '';
  const inline: RichText['inline'] = [];
  for (const block of doc.content) {
    if (
      !block ||
      typeof block !== 'object' ||
      (block as JsonNode).type !== 'paragraph' ||
      !Array.isArray((block as JsonNode).content)
    )
      continue;
    for (const child of (block as JsonNode).content as JsonNode[]) {
      if (child.type === 'hardBreak') {
        inline.push({ t: 'br' });
        continue;
      }
      if (child.type !== 'text' || typeof child.text !== 'string') continue;
      const marks: Mark[] = [];
      for (const raw of Array.isArray(child.marks) ? child.marks : []) {
        if (!raw || typeof raw !== 'object') continue;
        const m = raw as { type?: unknown; attrs?: Record<string, unknown> };
        const simple = typeof m.type === 'string' ? SIMPLE[m.type] : undefined;
        if (simple) marks.push(simple);
        else if (m.type === 'link' && typeof m.attrs?.['href'] === 'string' && isSafeUrl(m.attrs['href']))
          marks.push({ link: { href: m.attrs['href'], ...(m.attrs['target'] === '_blank' ? { newTab: true } : {}) } });
        else if (m.type === 'blxStyle' && m.attrs) {
          const style: Record<string, unknown> = {};
          for (const key of ['color', 'highlight', 'weight'])
            if (typeof m.attrs[key] === 'string') style[key] = m.attrs[key];
          const filtered = Object.fromEntries(
            Object.entries(style).filter(
              ([key, value]) =>
                !['color', 'highlight'].includes(key) ||
                typeof value !== 'string' ||
                tokens === undefined ||
                tokens.has(value),
            ),
          );
          if (Object.keys(filtered).length) marks.push({ style: filtered });
        }
      }
      inline.push({ t: 'text', s: child.text, ...(marks.length ? { m: marks } : {}) });
    }
  }
  const checked = validateRichText(normalizeRich({ v: 1, inline }), tokens);
  if (!checked.ok) return '';
  const result = checked.value;
  return result.inline.every((node) => node.t === 'text' && !node.m?.length) ? richToPlain(result) : result;
}

/** Maps stored model/string into the small ProseMirror document schema. */
export function fromModel(
  value: unknown,
  tokens?: ReadonlySet<string>,
): { type: 'doc'; content: { type: 'paragraph'; content: unknown[] }[] } {
  const candidate = typeof value === 'string' ? plainToRich(value) : value;
  const checked = validateRichText(candidate, tokens);
  const model = checked.ok ? normalizeRich(checked.value) : plainToRich('');
  const content: unknown[] = [];
  for (const node of model.inline) {
    if (node.t === 'br') {
      content.push({ type: 'hardBreak' });
      continue;
    }
    const marks = (node.m ?? []).map((mark) => {
      if (typeof mark === 'string')
        return {
          type: ({ strong: 'bold', em: 'italic', u: 'underline', s: 'strike', code: 'code' } as Record<string, string>)[
            mark
          ],
        };
      if ('link' in mark)
        return {
          type: 'link',
          attrs: { href: mark.link.href, target: mark.link.newTab ? '_blank' : null, rel: 'noopener noreferrer' },
        };
      return {
        type: 'blxStyle',
        attrs: {
          color: mark.style.color ?? null,
          highlight: mark.style.highlight ?? null,
          weight: mark.style.weight ?? null,
        },
      };
    });
    content.push({ type: 'text', text: node.s, ...(marks.length ? { marks } : {}) });
  }
  return { type: 'doc', content: [{ type: 'paragraph', content }] };
}
