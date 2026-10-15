import type { FieldControlProps } from './field-types';

export function MediaControl({
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
  if (definition.kind !== 'media') return null;
  return (
    <input
      id={id}
      type="number"
      min={1}
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
