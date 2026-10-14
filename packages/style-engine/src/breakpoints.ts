export interface BreakpointDef {
  id: string;
  /** `null` for the base (widest) breakpoint; a `max-width` in CSS pixels for the others. */
  maxWidth: number | null;
}

/** ADR 0005: base, `tablet` up to 1024px, `mobile` up to 640px. Widest first; the order is fixed, the widths are configurable. */
export const DEFAULT_BREAKPOINTS: readonly BreakpointDef[] = [
  { id: 'base', maxWidth: null },
  { id: 'tablet', maxWidth: 1024 },
  { id: 'mobile', maxWidth: 640 },
];

/**
 * Checks a breakpoint registry: `base` first and without a width, then unique ids with strictly decreasing integer
 * `max-width` values (1 to 10,000 px). Returns the problem, or `null` when the registry is valid.
 */
export function validateBreakpoints(list: readonly BreakpointDef[]): string | null {
  const first = list[0];
  if (first?.id !== 'base' || first.maxWidth !== null) return 'the first breakpoint must be base without a width';
  const seen = new Set<string>(['base']);
  let previous = Number.POSITIVE_INFINITY;
  for (const bp of list.slice(1)) {
    if (!/^[a-z][a-z0-9-]{0,31}$/.test(bp.id) || seen.has(bp.id)) return `invalid or repeated breakpoint id "${bp.id}"`;
    seen.add(bp.id);
    const width = bp.maxWidth;
    if (width === null || !Number.isSafeInteger(width) || width < 1 || width > 10_000 || width >= previous) {
      return `breakpoint "${bp.id}" needs an integer max-width below the previous one`;
    }
    previous = width;
  }
  return null;
}

/**
 * Breakpoints are nested `max-width` conditions: a viewport matches `base` and every breakpoint whose `maxWidth` is at least
 * its width, so the matches are a prefix of the (widest first) list and the last one is the narrowest. Requires a valid registry.
 */
export function breakpointsMatching(list: readonly BreakpointDef[], width: number): string[] {
  return list.filter((bp) => bp.maxWidth === null || width <= bp.maxWidth).map((bp) => bp.id);
}

/** The narrowest breakpoint a viewport width falls into (what the editor's viewport switcher shows). */
export function viewportBreakpoint(list: readonly BreakpointDef[], width: number): string {
  return breakpointsMatching(list, width).at(-1) ?? 'base';
}
