import { resolveModes } from './modes.ts';
import type { Mode, Preset } from './schema.ts';

/** Opaque sRGB hex only. Alpha, named colors, rgb(), hsl(), wide gamut and gradients are unsupported. */
export function relativeLuminance(color: string): number | undefined {
  const input = color.trim();
  const digits = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input)?.[1];
  if (digits === undefined) return undefined;
  const channels = [0, 1, 2].map((index) => {
    const part = digits.length === 3 ? digits.charAt(index).repeat(2) : digits.slice(index * 2, index * 2 + 2);
    return Number.parseInt(part, 16);
  });
  const linear = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return (linear[0] ?? 0) * 0.2126 + (linear[1] ?? 0) * 0.7152 + (linear[2] ?? 0) * 0.0722;
}

/** WCAG 2.x contrast ratio, or undefined when either color cannot be measured safely. */
export function contrastRatio(foreground: string, background: string): number | undefined {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  if (a === undefined || b === undefined) return undefined;
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export const PRESET_SEMANTIC_COLORS = [
  'color-bg',
  'color-text',
  'color-link',
  'color-primary',
  'color-on-primary',
  'color-line',
] as const;

export type PresetAccessibilityIssueCode = 'missing-token' | 'unresolved-token' | 'unsupported-color' | 'low-contrast';

export interface PresetAccessibilityIssue {
  code: PresetAccessibilityIssueCode;
  mode: Mode;
  foreground: string;
  background?: string;
  minimum?: number;
  actual?: number;
}

const PAIRS = [
  ['color-text', 'color-bg', 4.5],
  ['color-link', 'color-bg', 4.5],
  ['color-on-primary', 'color-primary', 4.5],
  ['color-line', 'color-bg', 3],
] as const;

/** Checks the preset's resolved semantic colors independently in light and dark. */
export function checkPresetAccessibility(preset: Pick<Preset, 'tokens'>): PresetAccessibilityIssue[] {
  const resolution = resolveModes(preset);
  const tokens = new Map(preset.tokens.map((token) => [token.name, token]));
  const issues: PresetAccessibilityIssue[] = [];
  for (const mode of ['light', 'dark'] as const) {
    const values = resolution[mode];
    for (const name of PRESET_SEMANTIC_COLORS) {
      if (tokens.get(name)?.category !== 'color') {
        issues.push({ code: 'missing-token', mode, foreground: name });
      } else if (!values.has(name)) {
        issues.push({ code: 'unresolved-token', mode, foreground: name });
      } else if (relativeLuminance(values.get(name) ?? '') === undefined) {
        issues.push({ code: 'unsupported-color', mode, foreground: name });
      }
    }
    for (const [foreground, background, minimum] of PAIRS) {
      const fg = values.get(foreground);
      const bg = values.get(background);
      if (fg === undefined || bg === undefined) continue;
      const actual = contrastRatio(fg, bg);
      if (actual !== undefined && actual < minimum) {
        issues.push({ code: 'low-contrast', mode, foreground, background, minimum, actual });
      }
    }
  }
  return issues;
}
