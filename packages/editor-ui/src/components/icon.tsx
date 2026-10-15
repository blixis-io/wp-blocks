import { ICONS, type IconName } from '../icons/registry';

export interface IconProps {
  name: IconName;
  size?: number;
  weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';
  label?: string;
  mirrorInRtl?: boolean;
  className?: string;
}

/** Accessible Phosphor icon. Decorative by default; named labels expose meaningful icons to AT. */
export function Icon({ name, size = 16, weight = 'regular', label, mirrorInRtl = false, className }: IconProps) {
  const Glyph = ICONS[name];
  const classes = [className, mirrorInRtl ? 'rtl:-scale-x-100' : undefined].filter(Boolean).join(' ');
  return (
    <Glyph
      size={size}
      weight={weight}
      className={classes || undefined}
      {...(label ? { 'aria-label': label, role: 'img' as const } : { 'aria-hidden': true })}
    />
  );
}
