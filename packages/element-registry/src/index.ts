export { checkAgainstRegistry, type RegistryIssue, type RegistryIssueCode } from './checks.ts';
export { CORE_ELEMENTS, createCoreRegistry, createEditorRegistry } from './core-elements.ts';
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
export {
  ElementRegistry,
  describe,
  type Defaults,
  type PropIssue,
  type PropIssueCode,
  type RegisterResult,
  type Source,
} from './registry.ts';
export { comparePropertyIds, type PropertyIdLock } from './lock.ts';
export { isSafeUrl } from './url.ts';
export {
  ELEMENT_DEFINITIONS_V2,
  ELEMENT_PALETTE_V2,
  editorElementEntitlementV2,
  getElementDefinitionV2,
  isElementInsertableV2,
  validateElementTreeV2,
  type ElementInstanceV2,
  type InstanceIssueV2,
  type EditorElementEntitlement,
  type EditorEntitlementFilter,
} from './v2.ts';
export type {
  GeneratedElementDefinition,
  GeneratedElementId,
  GeneratedElementType,
  GeneratedElementStatus,
} from './generated-element-types.ts';
