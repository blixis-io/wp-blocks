/** Inspector style fields and their UI control families, kept independent of React. */
export const STYLE_FIELDS = [
  { id: 'margin', key: 'inspector.style.spacing', kind: 'spacing' },
  { id: 'padding', key: 'inspector.style.padding', kind: 'spacing' },
  { id: 'color', key: 'inspector.style.color', kind: 'token' },
  { id: 'background-color', key: 'inspector.style.background', kind: 'token' },
  { id: 'font-size', key: 'inspector.style.fontSize', kind: 'token' },
  { id: 'font-weight', key: 'inspector.style.fontWeight', kind: 'token' },
  { id: 'line-height', key: 'inspector.style.lineHeight', kind: 'token' },
  { id: 'text-align', key: 'inspector.style.textAlign', kind: 'select' },
] as const;

/** Base selectors are represented by an omitted breakpoint in the document/compiler contract. */
export function styleSelector(breakpoint: string): { breakpoint?: string } {
  return breakpoint === 'base' ? {} : { breakpoint };
}

export type StyleField = (typeof STYLE_FIELDS)[number];
