import { parseBoxValue, formatBoxValue, type BoxUnit } from '../inspector/box-model';

export const RESIZE_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
export type ResizeHandle = (typeof RESIZE_HANDLES)[number];
type ResizeUnit = BoxUnit | 'vw';
export interface ResizeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function rectAtScroll(rect: ResizeRect, scroll: { x: number; y: number }): ResizeRect {
  return { ...rect, x: rect.x - scroll.x, y: rect.y - scroll.y };
}

export function resizeDimensions(handle: ResizeHandle): { width: boolean; height: boolean } {
  return { width: handle.includes('e') || handle.includes('w'), height: handle.includes('n') || handle.includes('s') };
}

export function resizeFromDelta(
  rect: ResizeRect,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  options: { shift?: boolean; alt?: boolean; rtl?: boolean; snap?: boolean } = {},
): ResizeRect {
  const dimensions = resizeDimensions(handle);
  // Handles identify the physical edge. RTL changes the logical side label and placement, never physical delta math.
  const logicalHorizontal = handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0;
  const horizontal = options.rtl ? -logicalHorizontal : logicalHorizontal;
  const vertical = handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0;
  let w = rect.w + horizontal * dx * (options.alt ? 2 : 1);
  let h = rect.h + vertical * dy * (options.alt ? 2 : 1);
  if (options.shift && dimensions.width && dimensions.height) {
    const ratio = rect.w / Math.max(1, rect.h);
    if (Math.abs(dx) >= Math.abs(dy)) h = w / ratio;
    else w = h * ratio;
  }
  if (options.snap) {
    if (dimensions.width) w = Math.round(w / 8) * 8;
    if (dimensions.height) h = Math.round(h / 8) * 8;
  }
  w = dimensions.width ? Math.max(8, Math.min(5000, Math.round(w))) : rect.w;
  h = dimensions.height ? Math.max(8, Math.min(5000, Math.round(h))) : rect.h;
  return {
    x: rect.x - (options.alt && dimensions.width ? (w - rect.w) / 2 : horizontal < 0 ? w - rect.w : 0),
    y: rect.y - (options.alt && dimensions.height ? (h - rect.h) / 2 : vertical < 0 ? h - rect.h : 0),
    w,
    h,
  };
}

export function resizeCssValue(
  px: number,
  current: string | undefined,
  parentPx: number,
  viewportPx = parentPx,
): string {
  const parsed = parseBoxValue(current);
  const vwMatch = current === undefined ? null : /^(-?(?:\d+\.?\d*|\.\d+))vw$/i.exec(current.trim());
  const unit: ResizeUnit = parsed?.unit ?? (vwMatch ? 'vw' : 'px');
  const value =
    unit === 'px'
      ? px
      : unit === '%'
        ? (px / Math.max(parentPx, 1)) * 100
        : unit === 'vw'
          ? (px / Math.max(viewportPx, 1)) * 100
          : px / 16;
  const rounded = unit === 'px' ? Math.round(value) : unit === '%' ? Math.round(value) : Math.round(value * 20) / 20;
  return unit === 'vw' ? `${String(rounded)}vw` : formatBoxValue(rounded, unit);
}

export function resizePixels(
  value: string | undefined,
  rectPx: number,
  parentPx: number,
  viewportPx = parentPx,
): number {
  const parsed = parseBoxValue(value);
  if (!parsed) {
    const vwMatch = value === undefined ? null : /^(-?(?:\d+\.?\d*|\.\d+))vw$/i.exec(value.trim());
    return vwMatch ? (Number(vwMatch[1]) / 100) * viewportPx : rectPx;
  }
  if (parsed.unit === 'px') return parsed.number;
  if (parsed.unit === '%') return (parsed.number / 100) * parentPx;
  return parsed.number * 16;
}
