import { createCoreRegistry } from '@blixis/wp-element-registry';

/** Read-only lookup of element titles; constant data, independent of the editor state. */
const registry = createCoreRegistry();

/** Human label of an element type; unknown types (an add-on that is gone) show their type id. */
export const elementLabel = (type: string): string => registry.get(type)?.title ?? type;
