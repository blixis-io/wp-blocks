import { validateDeclaration } from '@blixis/wp-style-engine';

export const BOX_SIDES = ['block-start', 'inline-end', 'block-end', 'inline-start'] as const;
export type BoxSide = (typeof BOX_SIDES)[number];
export type BoxLayer = 'margin' | 'border' | 'padding';
export type BoxUnit = 'px' | 'rem' | 'em' | '%';
export const BOX_UNITS: readonly BoxUnit[] = ['px', 'rem', 'em', '%'];

export function parseBoxValue(value: string | undefined): { number: number; unit: BoxUnit } | null {
  if (!value) return null;
  if (value.trim() === '0') return { number: 0, unit: 'px' };
  const match = /^(-?(?:\d+\.?\d*|\.\d+))(px|rem|em|%)$/i.exec(value.trim());
  if (!match || !BOX_UNITS.includes(match[2] as BoxUnit)) return null;
  const number = Number(match[1]);
  return Number.isFinite(number) ? { number, unit: match[2] as BoxUnit } : null;
}

export function formatBoxValue(number: number, unit: BoxUnit): string {
  const rounded = Math.round(number * 100) / 100;
  return `${String(Object.is(rounded, -0) ? 0 : rounded)}${unit}`;
}

export function boxStep(unit: BoxUnit, shift: boolean, alt: boolean): number {
  return alt && (unit === 'rem' || unit === 'em') ? 0.1 : shift ? 10 : 1;
}

export function boxProperty(layer: BoxLayer, side: BoxSide): string {
  return layer === 'border' ? 'border-width' : `${layer}-${side}`;
}

export function boxSideValue(
  layer: BoxLayer,
  side: BoxSide,
  declarations: Readonly<Record<string, string>>,
): string | undefined {
  const property = boxProperty(layer, side);
  return declarations[property] ?? (layer === 'border' ? undefined : declarations[layer]);
}

export function setLinkedBoxSides(
  layer: BoxLayer,
  declarations: Readonly<Record<string, string>>,
  value: string,
): Record<string, string> {
  if (layer === 'border') return { ...declarations, 'border-width': value };
  return Object.fromEntries([
    ...Object.entries(declarations),
    ...BOX_SIDES.map((side) => [boxProperty(layer, side), value] as const),
  ]);
}

export function resetBoxSide(
  layer: BoxLayer,
  side: BoxSide,
  declarations: Readonly<Record<string, string>>,
): Record<string, string> {
  const property = boxProperty(layer, side);
  return Object.fromEntries(Object.entries(declarations).filter(([key]) => key !== property));
}

export function validBoxValue(layer: BoxLayer, side: BoxSide, value: string): boolean {
  if (layer === 'margin' && value === 'auto') return validateDeclaration(boxProperty(layer, side), value).ok;
  return validateDeclaration(boxProperty(layer, side), value).ok;
}
