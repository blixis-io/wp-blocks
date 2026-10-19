import { DIRECTIONAL_ICONS, ICONS, type GeneratedElementIconName, type IconName } from '../icons/registry';
import { GENERATED_ELEMENT_ICONS } from '../icons/generated-element-icons';

export interface IconProps {
  name: IconName | GeneratedElementIconName;
  size?: number;
  weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';
  label?: string;
  mirrorInRtl?: boolean;
  flipX?: boolean;
  className?: string;
}

/** Registered Solar SVG. Decorative by default; named labels expose meaningful icons to AT. */
export function Icon({ name, size = 16, label, mirrorInRtl = false, flipX = false, className }: IconProps) {
  const icon = Object.hasOwn(GENERATED_ELEMENT_ICONS, name)
    ? GENERATED_ELEMENT_ICONS[name as GeneratedElementIconName]
    : ICONS[name as IconName];
  const shouldMirror = mirrorInRtl && DIRECTIONAL_ICONS.has(name as IconName);
  // Keep SVG geometry consistent across the registry: Solar's three-dot glyph uses circles only.
  const body = icon.body.replace(
    /<circle cx="(\d+)" cy="(\d+)" r="(\d+)"\/>/g,
    (_match, x: string, y: string, radius: string) => {
      const diameter = Number(radius) * 2;
      return `<path d="M${String(Number(x) - Number(radius))} ${y}a${radius} ${radius} 0 1 0 ${String(diameter)} 0a${radius} ${radius} 0 1 0 -${String(diameter)} 0"/>`;
    },
  );
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox={`0 0 ${String(icon.width ?? 24)} ${String(icon.height ?? 24)}`}
      className={
        [className, shouldMirror ? 'blx-icon-mirror-rtl' : undefined, flipX ? 'blx-icon-flip-x' : undefined]
          .filter(Boolean)
          .join(' ') || undefined
      }
      {...(label ? { 'aria-label': label, role: 'img' as const } : { 'aria-hidden': true })}
      focusable="false"
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}
