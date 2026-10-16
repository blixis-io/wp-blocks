import type { PropDefinition } from '@blixis/wp-element-registry';

export type ControlFamily = 'text' | 'number' | 'choice' | 'media';
export type InspectorTab = 'content' | 'style' | 'advanced';

/** Maps schema kinds to presentation families without importing React or editor state. */
export function controlFamilyFor(definition: PropDefinition): ControlFamily {
  switch (definition.kind) {
    case 'string':
    case 'text':
    case 'url':
      return 'text';
    case 'integer':
      return 'number';
    case 'enum':
    case 'boolean':
      return 'choice';
    case 'media':
      return 'media';
  }
}

/** Property placement is derived from the element schema, with media identity kept in Content. */
export function propertyBelongsToTab(_name: string, _definition: PropDefinition, tab: InspectorTab): boolean {
  return tab === 'content';
}
