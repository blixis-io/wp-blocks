export { checkAgainstRegistry, type RegistryIssue, type RegistryIssueCode } from './checks.ts';
export { CORE_ELEMENTS, createCoreRegistry } from './core-elements.ts';
export {
  CATEGORIES,
  CLASSIFICATIONS,
  EXTENSION_API_VERSION,
  ElementDefinitionSchema,
  PropDefinitionSchema,
  valueSchemaFor,
  type Category,
  type Classification,
  type ElementDefinition,
  type PropDefinition,
} from './definition.ts';
export { ElementRegistry, describe, type Defaults, type RegisterResult, type Source } from './registry.ts';
export { isSafeUrl } from './url.ts';
