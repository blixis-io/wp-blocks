import { ICONS, type IconName } from '../icons/registry';

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
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox={`0 0 ${String(icon.width ?? 24)} ${String(icon.height ?? 24)}`}
      className={[className, mirrorInRtl ? 'rtl:-scale-x-100' : undefined].filter(Boolean).join(' ') || undefined}
      {...(label ? { 'aria-label': label, role: 'img' as const } : { 'aria-hidden': true })}
      focusable="false"
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  );
}
