import { createEditorRegistry } from '@blixis/wp-element-registry';
import type { MessageKey } from './messages/en_US';

/** Read-only lookup of element titles; constant data, independent of the editor state. */
const registry = createEditorRegistry();
const LABEL_KEYS: Readonly<Record<string, MessageKey>> = {
  'blixis/section': 'element.section',
  'blixis/container': 'element.container',
  'blixis/heading': 'element.heading',
  'blixis/text': 'element.text',
  'blixis/image': 'element.image',
  'blixis/button': 'element.button',
};

/** Human label of an element type; unknown types (an add-on that is gone) show their type id. */
export const elementLabel = (type: string, translate?: (key: MessageKey) => string): string => {
  const key = LABEL_KEYS[type];
  return key && translate ? translate(key) : (registry.get(type)?.title ?? type);
};
