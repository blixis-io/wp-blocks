import type { ChangeEvent } from 'react';
import type { FieldControlProps } from './field-types';

export function TextControl(props: FieldControlProps) {
  const { id, name, definition, draft, disabled, describedBy, onDraft, onCommit, onFocus, onBlur } = props;
  const multiline = definition.kind === 'string' && name === 'text' && definition.maxLength > 1000;
  const common = {
    id,
    disabled,
    'aria-describedby': describedBy,
    maxLength: definition.kind === 'string' ? definition.maxLength : undefined,
    value: draft,
    onFocus,
    onBlur,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onDraft(event.target.value);
      if (definition.kind !== 'url') onCommit(event.target.value);
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (definition.kind === 'url' && event.key === 'Enter') {
        event.preventDefault();
        onCommit(draft);
      }
    },
  };
  return multiline ? (
    <textarea {...common} rows={4} />
  ) : (
    <input {...common} type="text" inputMode={definition.kind === 'url' ? 'url' : undefined} />
  );
}
