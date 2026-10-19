import type { FieldControlProps } from './field-types';

export function NumberControl({
  id,
  definition,
  draft,
  disabled,
  describedBy,
  onDraft,
  onCommit,
  onFocus,
  onBlur,
}: FieldControlProps) {
  if (definition.kind !== 'integer' && definition.kind !== 'number') return null;
  return (
    <input
      id={id}
      type="number"
      min={definition.min}
      max={definition.max}
      step={definition.kind === 'integer' ? 1 : 0.0001}
      disabled={disabled}
      aria-describedby={describedBy}
      value={draft}
      onFocus={onFocus}
      onBlur={onBlur}
      onChange={(event) => {
        onDraft(event.target.value);
        if (event.target.value !== '') onCommit(Number(event.target.value));
      }}
    />
  );
}
