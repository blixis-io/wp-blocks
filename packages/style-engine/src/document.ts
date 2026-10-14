import type { BuilderDocument, ElementNode } from '@blixis/wp-core';
import type { CssIssueCode } from './limits.ts';
import { validateDeclarations } from './validate.ts';

export interface StyleIssue {
  code: CssIssueCode;
  path: string;
  message: string;
}

const MAX_ISSUES = 50;

/**
 * Checks every style rule of a structurally valid document against the CSS allow-list (BWB-023). Iterative; stops at 50
 * issues. A document with issues is not saved by the editor and is never compiled as is: the compiler sanitizes anyway.
 */
export function checkDocumentStyles(doc: BuilderDocument): StyleIssue[] {
  const issues: StyleIssue[] = [];
  const stack: { node: ElementNode; path: string }[] = [];
  for (let i = doc.root.length - 1; i >= 0; i -= 1) {
    const node = doc.root[i];
    if (node !== undefined) stack.push({ node, path: `$.root[${String(i)}]` });
  }
  while (stack.length > 0 && issues.length < MAX_ISSUES) {
    const item = stack.pop();
    if (item === undefined) break;
    const { node, path } = item;
    (node.style ?? []).forEach((rule, index) => {
      for (const issue of validateDeclarations(rule.declarations)) {
        if (issues.length < MAX_ISSUES) {
          issues.push({
            code: issue.code,
            path: `${path}.style[${String(index)}].declarations.${issue.name}`,
            message: issue.message,
          });
        }
      }
    });
    for (let i = node.children.length - 1; i >= 0; i -= 1) {
      const child = node.children[i];
      if (child !== undefined) stack.push({ node: child, path: `${path}.children[${String(i)}]` });
    }
  }
  return issues;
}
