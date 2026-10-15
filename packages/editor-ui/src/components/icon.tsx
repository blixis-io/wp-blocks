import { DIRECTIONAL_ICONS, ICONS, type IconName } from '../icons/registry';

export interface IconProps {
  name: IconName;
  size?: number;
  weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';
  label?: string;
  mirrorInRtl?: boolean;
  className?: string;
}

/** Solar Linear SVG. Decorative by default; named labels expose meaningful icons to AT. */
export function Icon({ name, size = 16, label, mirrorInRtl = false, className }: IconProps) {
  const icon = ICONS[name];
  const shouldMirror = mirrorInRtl && DIRECTIONAL_ICONS.has(name);
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
      className={[className, shouldMirror ? 'rtl:-scale-x-100' : undefined].filter(Boolean).join(' ') || undefined}
      {...(label ? { 'aria-label': label, role: 'img' as const } : { 'aria-hidden': true })}
      focusable="false"
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}
