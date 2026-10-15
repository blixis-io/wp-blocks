import { useI18n } from '../../i18n-react';
import type { FieldControlProps } from './field-types';

export function ChoiceControl({ id, definition, value, disabled, describedBy, onCommit }: FieldControlProps) {
  const { t } = useI18n();
  if (definition.kind === 'boolean') {
    return (
      <input
        id={id}
        type="checkbox"
        disabled={disabled}
        aria-describedby={describedBy}
        checked={typeof value === 'boolean' ? value : (definition.default ?? false)}
        onChange={(event) => {
          onCommit(event.target.checked);
        }}
      />
    );
  }
  if (definition.kind !== 'enum') return null;
  return (
    <select
      id={id}
      disabled={disabled}
      aria-describedby={describedBy}
      value={typeof value === 'string' ? value : (definition.default ?? '')}
      onChange={(event) => {
        onCommit(event.target.value);
      }}
    >
      {definition.values.map((option) => (
        <option key={option} value={option}>
          {t(`inspector.option.${option}` as never)}
        </option>
      ))}
    </select>
  );
}
