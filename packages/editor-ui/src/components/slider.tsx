import { useRef } from 'react';

export interface SliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  label: string;
  describedBy?: string | undefined;
  disabled?: boolean;
  onValueChange: (value: number) => void;
  onValueCommit?: (value: number) => void;
}

export function sliderProgress(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

export function sliderFillProgress(value: number, min: number, max: number, rtl = false): number {
  const progress = sliderProgress(value, min, max);
  return rtl ? 1 - progress : progress;
}

/** Small accessible slider for inspector values; pointer movement is committed once on release. */
export function Slider({
  value,
  min,
  max,
  step,
  label,
  describedBy,
  disabled = false,
  onValueChange,
  onValueCommit,
}: SliderProps) {
  const track = useRef<HTMLDivElement>(null);
  const dragStart = useRef<number | null>(null);
  const progress = sliderProgress(value, min, max);
  const setFromPointer = (event: React.PointerEvent<HTMLDivElement>): number | null => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
    const usableWidth = Math.max(1, rect.width - 14);
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left - 7) / usableWidth));
    const adjusted = rtl ? 1 - ratio : ratio;
    const raw = min + adjusted * (max - min);
    const next = Math.min(max, Math.max(min, min + Math.round((raw - min) / step) * step));
    onValueChange(next);
    return next;
  };
  const keyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const amount = step * (event.shiftKey ? 10 : 1);
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
    const delta =
      event.key === 'ArrowRight' ? (rtl ? -amount : amount) : event.key === 'ArrowLeft' ? (rtl ? amount : -amount) : 0;
    let next = value + delta;
    if (event.key === 'PageUp') next = value + step * 10;
    if (event.key === 'PageDown') next = value - step * 10;
    if (event.key === 'Home') next = min;
    if (event.key === 'End') next = max;
    if (next !== value) {
      event.preventDefault();
      onValueChange(Math.min(max, Math.max(min, next)));
      onValueCommit?.(Math.min(max, Math.max(min, next)));
    }
  };
  return (
    <div
      ref={track}
      className="blx-slider"
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-describedby={describedBy}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={String(value)}
      aria-disabled={disabled}
      onKeyDown={keyDown}
      onPointerDown={(event) => {
        if (disabled) return;
        dragStart.current = value;
        if (typeof event.currentTarget.setPointerCapture === 'function')
          event.currentTarget.setPointerCapture(event.pointerId);
        setFromPointer(event);
      }}
      onPointerMove={(event) => {
        if (dragStart.current !== null) setFromPointer(event);
      }}
      onPointerUp={(event) => {
        if (dragStart.current !== null) {
          const next = setFromPointer(event);
          onValueCommit?.(next ?? value);
          dragStart.current = null;
        }
      }}
      onPointerCancel={() => {
        dragStart.current = null;
      }}
    >
      <span className="blx-slider-track" />
      <span className="blx-slider-fill" style={{ insetInlineEnd: `calc(${String((1 - progress) * 100)}% + 7px)` }} />
      <span
        className="blx-slider-thumb"
        data-slider-progress={progress}
        style={{ insetInlineStart: `clamp(7px, ${String(progress * 100)}%, calc(100% - 7px))` }}
      />
    </div>
  );
}
