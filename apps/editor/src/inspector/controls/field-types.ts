import type { Json } from '@blixis/wp-core';
import type { PropDefinition } from '@blixis/wp-element-registry';

export interface FieldControlProps {
  id: string;
  name: string;
  definition: PropDefinition;
  value: Json | undefined;
  draft: string;
  disabled: boolean;
  describedBy?: string | undefined;
  onDraft: (value: string) => void;
  onCommit: (value: Json) => void;
  onFocus: () => void;
  onBlur: () => void;
}
