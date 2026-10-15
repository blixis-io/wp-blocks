/** Inspector style fields and their UI control families, kept independent of React. */
export const STYLE_FIELDS = [
  { id: 'font-family', key: 'inspector.style.fontFamily', kind: 'token' },
  { id: 'font-weight', key: 'inspector.style.fontWeight', kind: 'token' },
  { id: 'font-size', key: 'inspector.style.size', kind: 'token' },
  { id: 'line-height', key: 'inspector.style.lineHeight', kind: 'token' },
  { id: 'letter-spacing', key: 'inspector.style.letterSpacing', kind: 'token' },
  { id: 'text-transform', key: 'inspector.style.textTransform', kind: 'select' },
  { id: 'color', key: 'inspector.style.color', kind: 'token' },
  { id: 'margin', key: 'inspector.style.spacing', kind: 'spacing' },
  { id: 'padding', key: 'inspector.style.padding', kind: 'spacing' },
  { id: 'width', key: 'inspector.style.width', kind: 'select' },
  { id: 'text-align', key: 'inspector.style.textAlign', kind: 'select' },
  { id: 'display', key: 'inspector.style.display', kind: 'select' },
  { id: 'border-radius', key: 'inspector.style.borderRadius', kind: 'token' },
  { id: 'border-width', key: 'inspector.style.borderWidth', kind: 'token' },
  { id: 'border-style', key: 'inspector.style.borderStyle', kind: 'select' },
  { id: 'border-color', key: 'inspector.style.borderColor', kind: 'token' },
  { id: 'box-shadow', key: 'inspector.style.boxShadow', kind: 'select' },
  { id: 'background-color', key: 'inspector.style.background', kind: 'token' },
] as const;

/** Base selectors are represented by an omitted breakpoint in the document/compiler contract. */
export function styleSelector(breakpoint: string): { breakpoint?: string } {
  return breakpoint === 'base' ? {} : { breakpoint };
}

export type StyleField = (typeof STYLE_FIELDS)[number];

export function humanizeTokenName(tokenId: string, locale: 'en_US' | 'nl_NL' = 'en_US'): string {
  let slug = tokenId
    .replace(/^--blx-/, '')
    .replace(/^blx-/, '')
    .trim();
  if (slug.startsWith('shadow-')) slug = slug.slice('shadow-'.length);
  const name = slug.replace(/-+/g, ' ').trim();
  if (!name) return locale === 'nl_NL' ? 'Token' : 'Token';
  const words: Readonly<Record<string, string>> =
    locale === 'nl_NL'
      ? { none: 'Geen', card: 'Kaart', raised: 'Verhoogd', overlay: 'Overlay', shadow: 'Schaduw' }
      : { none: 'None', card: 'Card', raised: 'Raised', overlay: 'Overlay', shadow: 'Shadow' };
  const parts = name.split(' ');
  return parts
    .map((part, index) => {
      const translated = Object.hasOwn(words, part) ? words[part] : undefined;
      return translated ?? (index === 0 ? (part[0] ?? '').toUpperCase() + part.slice(1) : part);
    })
    .join(' ');
}

export function shouldUseSelect(labels: readonly string[]): boolean {
  return labels.length > 4 || labels.some((label) => label.length > 8);
}

export const TEXT_ALIGNMENT_ICON_MAP = {
  left: 'textAlignLeft',
  center: 'textAlignCenter',
  right: 'textAlignRight',
  justify: 'textAlignJustify',
} as const;
