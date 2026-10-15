export interface NumberWithUnitProps {
  id: string;
  label: string;
  value: number;
  unit: string;
  units: readonly string[];
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  describedBy?: string | undefined;
  onValueChange: (value: number, unit: string) => void;
  onInvalid?: () => void;
}

export function formatCssNumber(value: number): string {
  if (!Number.isFinite(value)) return '';
  return String(Number(value.toFixed(2)));
}

/** Bounded number entry paired with only the units accepted by the CSS compiler. */
export function NumberWithUnit({
  id,
  label,
  value,
  unit,
  units,
  min,
  max,
  step = 1,
  disabled = false,
  describedBy,
  onValueChange,
  onInvalid,
}: NumberWithUnitProps) {
  return (
    <div className="blx-number-unit">
      <input
        id={id}
        aria-label={label}
        aria-describedby={describedBy}
        type="text"
        inputMode="decimal"
        role="spinbutton"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={formatCssNumber(value)}
        onChange={(event) => {
          const draft = event.target.value;
          const next = Number(draft);
          if (/^-?(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(draft) && Number.isFinite(next) && next >= min && next <= max)
            onValueChange(next, unit);
          else onInvalid?.();
        }}
      />
      <select
        aria-label={`${label} unit`}
        value={unit}
        disabled={disabled}
        onChange={(event) => {
          if (units.includes(event.target.value)) onValueChange(value, event.target.value);
        }}
      >
        {units.map((choice) => (
          <option key={choice} value={choice} aria-label={choice ? undefined : 'Unitless'}>
            {choice || '—'}
          </option>
        ))}
      </select>
    </div>
  );
}
