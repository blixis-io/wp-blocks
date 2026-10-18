import {
  GENERATED_ELEMENT_DEFINITIONS,
  GENERATED_ELEMENT_PALETTE,
  type GeneratedElementDefinition,
} from './generated-element-types.ts';
import { isSafeUrl } from './url.ts';

export interface ElementInstanceV2 {
  id: string;
  type: string;
  props: Record<string, unknown>;
  styles: Record<string, unknown>;
  children: ElementInstanceV2[];
}

export interface InstanceIssueV2 {
  path: string;
  code: string;
  message: string;
}
export type EditorElementEntitlement = 'available' | 'restricted';
export type EditorEntitlementFilter = (
  elementId: string,
  defaultValue: EditorElementEntitlement,
) => EditorElementEntitlement;
export const ELEMENT_DEFINITIONS_V2: readonly GeneratedElementDefinition[] = GENERATED_ELEMENT_DEFINITIONS;
export const ELEMENT_PALETTE_V2 = GENERATED_ELEMENT_PALETTE;
const byType = new Map<string, GeneratedElementDefinition>(
  ELEMENT_DEFINITIONS_V2.map((definition) => [`blixis/${definition.id}`, definition]),
);
// These legacy template instance ids predate the owner-provided 253-definition catalog.
for (const [alias, sourceId] of [
  ['page', 'section'],
  ['navigation', 'nav-menu'],
  ['site-header', 'sticky-header'],
  ['site-footer', 'section'],
] as const) {
  const source = ELEMENT_DEFINITIONS_V2.find((definition) => definition.id === sourceId);
  if (source)
    byType.set(`blixis/${alias}`, {
      ...source,
      id: alias as GeneratedElementDefinition['id'],
      title: alias,
      status: 'ready',
    });
}

function validProperty(type: string, property: Record<string, unknown>, value: unknown): boolean {
  const options = Array.isArray(property['options']) ? property['options'] : [];
  if (type === 'string' || type === 'text' || type === 'richtext')
    return typeof value === 'string' || (type === 'richtext' && value !== null && typeof value === 'object');
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'number' || type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value) || (type === 'integer' && !Number.isInteger(value)))
      return false;
    return (
      (typeof property['minimum'] !== 'number' || value >= property['minimum']) &&
      (typeof property['maximum'] !== 'number' || value <= property['maximum'])
    );
  }
  if (type === 'enum') return options.includes(value);
  if (type.startsWith('array<') && type.endsWith('>')) {
    if (!Array.isArray(value) || (typeof property['maxItems'] === 'number' && value.length > property['maxItems']))
      return false;
    const itemType = type.slice('array<'.length, -1);
    return value.every((item) => validProperty(itemType, property, item));
  }
  if (type === 'asset-ref')
    return (
      value === null ||
      (typeof value === 'string' && /^(?:(?:asset:)?[a-zA-Z0-9_-]{1,128}|attachment:[1-9]\d{0,8})$/.test(value))
    );
  if (type === 'url') return typeof value === 'string' && isSafeUrl(value);
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'object'
  );
}

/** Validate saved instance trees against generated definitions without mutating or dropping unknown content. */
export function validateElementTreeV2(root: unknown): InstanceIssueV2[] {
  const issues: InstanceIssueV2[] = [];
  if (!Array.isArray(root))
    return [{ path: '$', code: 'invalid-root', message: 'Element tree root must be an array.' }];
  const ids = new Set<string>();
  const rootValues: unknown[] = root as unknown[];
  const stack = rootValues.map((node, index) => ({ node, path: `$[${String(index)}]`, depth: 1 }));
  let nodes = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const { node, path, depth } = current;
    if (++nodes > 5000) {
      issues.push({ path, code: 'node-limit', message: 'Element tree exceeds 5000 nodes.' });
      break;
    }
    if (depth > 32) {
      issues.push({ path, code: 'depth-limit', message: 'Element tree exceeds 32 levels.' });
      continue;
    }
    if (node === null || typeof node !== 'object' || Array.isArray(node)) {
      issues.push({ path, code: 'invalid-instance', message: 'Element instance must be an object.' });
      continue;
    }
    const instance = node as Partial<ElementInstanceV2>;
    if (typeof instance.id !== 'string' || !/^[a-zA-Z0-9_-]{3,64}$/.test(instance.id) || ids.has(instance.id))
      issues.push({ path: `${path}.id`, code: 'invalid-id', message: 'Element id is invalid or duplicated.' });
    else ids.add(instance.id);
    if (typeof instance.type !== 'string') {
      issues.push({ path: `${path}.type`, code: 'invalid-type', message: 'Element type must be a string.' });
      continue;
    }
    const definition = byType.get(instance.type);
    if (definition) {
      const props = instance.props && typeof instance.props === 'object' ? instance.props : {};
      const propertyMap = definition['properties'] as Record<string, Record<string, unknown>>;
      for (const [key, value] of Object.entries(props)) {
        const property = propertyMap[key];
        if (!property) {
          issues.push({
            path: `${path}.props.${key}`,
            code: 'unknown-property',
            message: 'Property is not declared by the element definition.',
          });
          continue;
        }
        if (property['editorOnly'] === true)
          issues.push({
            path: `${path}.props.${key}`,
            code: 'editor-only-property',
            message: 'Editor-only properties cannot be persisted in element props.',
          });
        else if (!validProperty(String(property['type']), property, value))
          issues.push({
            path: `${path}.props.${key}`,
            code: 'invalid-property',
            message: `Value does not match declared type ${String(property['type'])}.`,
          });
      }
      for (const [key, property] of Object.entries(propertyMap))
        if (property['required'] === true && property['editorOnly'] !== true && !Object.hasOwn(props, key))
          issues.push({
            path: `${path}.props.${key}`,
            code: 'required-property',
            message: 'Required property is missing.',
          });
    }
    const children = Array.isArray(instance.children) ? instance.children : [];
    for (let index = children.length - 1; index >= 0; index--)
      stack.push({ node: children[index], path: `${path}.children[${String(index)}]`, depth: depth + 1 });
  }
  return issues;
}

export function getElementDefinitionV2(type: string): GeneratedElementDefinition | undefined {
  return byType.get(type);
}
export function isElementInsertableV2(type: string, showPlannedElements = false): boolean {
  const definition = byType.get(type);
  return definition?.status === 'ready' || (showPlannedElements && definition?.status === 'planned');
}

/** Editor-side entitlement hook. The default makes every catalog item available. */
export function editorElementEntitlementV2(
  elementId: string,
  filter: EditorEntitlementFilter = (_id, defaultValue) => defaultValue,
): EditorElementEntitlement {
  const result = filter(elementId, 'available');
  return result === 'restricted' ? 'restricted' : 'available';
}
