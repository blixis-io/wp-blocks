import type { BuilderDocument, ElementNode } from '@blixis/wp-core';
import type { ElementRegistry } from './registry.ts';

export type RegistryIssueCode =
  | 'unknown-element-type'
  | 'invalid-nesting'
  | 'unknown-property'
  | 'translatable-property-in-props'
  | 'invalid-property-value'
  | 'missing-required-property'
  | 'untranslatable-property'
  | 'invalid-translation-value';

export interface RegistryIssue {
  code: RegistryIssueCode;
  /** Unknown types are warnings (the document is kept as is); everything else is an error. */
  severity: 'error' | 'warning';
  path: string;
  message: string;
}

const MAX_ISSUES = 50;

/**
 * Checks a structurally valid document (`validateDocument`) against a registry: nesting rules, property classification,
 * property values and translation values. Unknown element types are preserved and only warned about, so a document stays
 * editable and renderable after an add-on is removed (ADR 0003, ADR 0009). Iterative; stops collecting at 50 issues.
 */
export function checkAgainstRegistry(doc: BuilderDocument, registry: ElementRegistry): RegistryIssue[] {
  const issues: RegistryIssue[] = [];
  const add = (code: RegistryIssueCode, severity: RegistryIssue['severity'], path: string, message: string): void => {
    if (issues.length < MAX_ISSUES) issues.push({ code, severity, path, message });
  };
  const typeById = new Map<string, string>();

  const stack: { node: ElementNode; parentType: string | null; path: string }[] = [];
  for (let i = doc.root.length - 1; i >= 0; i -= 1) {
    const node = doc.root[i];
    if (node !== undefined) stack.push({ node, parentType: null, path: `$.root[${String(i)}]` });
  }
  while (stack.length > 0) {
    const item = stack.pop();
    if (item === undefined) break;
    const { node, parentType, path } = item;
    typeById.set(node.id, node.type);
    if (!registry.has(node.type)) {
      add(
        'unknown-element-type',
        'warning',
        `${path}.type`,
        `${node.type} is not registered; it is kept unchanged and rendered with the safe fallback`,
      );
    } else {
      if (!registry.canNest(parentType, node.type) && (parentType === null || registry.has(parentType))) {
        add('invalid-nesting', 'error', path, `${node.type} may not be placed inside ${parentType ?? 'the page root'}`);
      }
      for (const issue of registry.propIssues(node.type, node.props))
        add(issue.code, 'error', `${path}.props`, issue.message);
    }
    for (let i = node.children.length - 1; i >= 0; i -= 1) {
      const child = node.children[i];
      if (child !== undefined)
        stack.push({ node: child, parentType: node.type, path: `${path}.children[${String(i)}]` });
    }
  }

  for (const [locale, stream] of Object.entries(doc.translations)) {
    for (const [elementId, entry] of Object.entries(stream)) {
      const type = typeById.get(elementId);
      const def = type === undefined ? undefined : registry.get(type);
      if (def === undefined) continue; // orphaned or unknown type: kept as is
      for (const [name, value] of Object.entries(entry.values)) {
        const where = `$.translations.${locale}.${elementId}.values.${name}`;
        const checked = registry.translationValue(def.type, name, value);
        if (checked.ok) continue;
        add(
          checked.code === 'not-translatable' ? 'untranslatable-property' : 'invalid-translation-value',
          'error',
          where,
          checked.message,
        );
      }
    }
  }
  return issues;
}
