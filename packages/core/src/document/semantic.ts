import { DOCUMENT_LIMITS } from '../schema/limits.ts';
import type { BuilderDocument, ElementNode } from '../schema/document.ts';
import type { DocumentIssue } from './issues.ts';

const MAX_COLLECTED = 50;
const REAL_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/;

function isRealTimestamp(text: string): boolean {
  const m = REAL_TIMESTAMP.exec(text);
  if (m === null) return false;
  const [year, month, day, hour, minute, second] = m.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day); // Date.UTC would map years 0-99 to 1900-1999
  date.setUTCHours(hour, minute, second, 0);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour
  );
}

export interface SemanticResult {
  errors: DocumentIssue[];
  warnings: DocumentIssue[];
  /** Ids of all elements, for callers that need them. */
  elementIds: Set<string>;
}

/**
 * Checks everything JSON Schema cannot express (docs/architecture/DOCUMENT-SCHEMA.md). The tree is walked iteratively with
 * the depth and node limits applied while walking, so a hostile tree cannot exhaust the stack or the heap.
 */
export function checkSemantics(doc: BuilderDocument): SemanticResult {
  const errors: DocumentIssue[] = [];
  const warnings: DocumentIssue[] = [];
  const add = (list: DocumentIssue[], code: DocumentIssue['code'], path: string, message: string): void => {
    if (list.length < MAX_COLLECTED) list.push({ code, path, message }); // never accumulate beyond what is reported
  };

  // --- element tree: unique ids, depth, node count, duplicate style rules ---
  const ids = new Map<string, string>();
  const stack: { node: ElementNode; depth: number; path: string }[] = doc.root
    .map((node, i) => ({ node, depth: 1, path: `$.root[${String(i)}]` }))
    .reverse();
  let nodes = 0;
  while (stack.length > 0) {
    const item = stack.pop();
    if (item === undefined) break;
    const { node, depth, path } = item;
    nodes += 1;
    if (nodes > DOCUMENT_LIMITS.maxNodes) {
      add(errors, 'too-many-nodes', path, `more than ${String(DOCUMENT_LIMITS.maxNodes)} elements`);
      break;
    }
    if (depth > DOCUMENT_LIMITS.maxTreeDepth) {
      add(errors, 'tree-too-deep', path, `element tree deeper than ${String(DOCUMENT_LIMITS.maxTreeDepth)} levels`);
      continue;
    }
    const first = ids.get(node.id);
    if (first === undefined) ids.set(node.id, path);
    else add(errors, 'duplicate-element-id', `${path}.id`, `element id "${node.id}" is already used at ${first}`);

    const seenRules = new Set<string>();
    (node.style ?? []).forEach((rule, i) => {
      const key = `${rule.breakpoint ?? ''}|${rule.mode ?? ''}|${rule.state ?? ''}`;
      if (seenRules.has(key)) {
        add(
          errors,
          'duplicate-style-rule',
          `${path}.style[${String(i)}]`,
          'two rules have the same breakpoint, mode and state; merge their declarations',
        );
      }
      seenRules.add(key);
    });
    for (let i = node.children.length - 1; i >= 0; i -= 1) {
      const child = node.children[i];
      if (child !== undefined) stack.push({ node: child, depth: depth + 1, path: `${path}.children[${String(i)}]` });
    }
  }

  // --- locales ---
  const localeSet = new Set<string>();
  doc.locales.forEach((locale, i) => {
    if (localeSet.has(locale))
      add(errors, 'duplicate-locale', `$.locales[${String(i)}]`, `locale ${locale} is listed twice`);
    localeSet.add(locale);
  });
  if (!localeSet.has(doc.defaultLocale)) {
    add(
      errors,
      'default-locale-not-listed',
      '$.defaultLocale',
      `defaultLocale ${doc.defaultLocale} must be one of locales`,
    );
  }
  if (!(doc.defaultLocale in doc.translations)) {
    add(
      errors,
      'missing-default-locale-stream',
      '$.translations',
      `translations must contain a stream (possibly empty) for the default locale ${doc.defaultLocale}`,
    );
  }

  // --- translations ---
  for (const [locale, entries] of Object.entries(doc.translations)) {
    if (!localeSet.has(locale)) {
      add(
        errors,
        'translation-locale-not-listed',
        `$.translations.${locale}`,
        `translations exist for ${locale}, which is not in locales`,
      );
    }
    for (const [elementId, entry] of Object.entries(entries)) {
      const exists = ids.has(elementId);
      if (!exists && entry.status !== 'orphaned') {
        add(
          errors,
          'translation-for-missing-element',
          `$.translations.${locale}.${elementId}`,
          'the element no longer exists; the entry must be marked orphaned, not dropped (ADR 0004)',
        );
      }
      if (exists && entry.status === 'orphaned') {
        add(
          warnings,
          'orphaned-entry-for-existing-element',
          `$.translations.${locale}.${elementId}`,
          'the entry is marked orphaned but its element exists',
        );
      }
    }
  }

  // --- global class references ---
  const referenced = new Set<string>();
  const collectClasses = (nodes_: readonly ElementNode[], path: string): void => {
    const walk: { node: ElementNode; path: string }[] = nodes_.map((node, i) => ({
      node,
      path: `${path}[${String(i)}]`,
    }));
    while (walk.length > 0) {
      const item = walk.pop();
      if (item === undefined) break;
      for (const classId of item.node.classIds ?? []) {
        referenced.add(classId);
        if (!(classId in doc.classRefs)) {
          add(
            errors,
            'unknown-class-reference',
            `${item.path}.classIds`,
            `class ${classId} is used but missing from classRefs`,
          );
        }
      }
      item.node.children.forEach((child, i) => walk.push({ node: child, path: `${item.path}.children[${String(i)}]` }));
      if (walk.length > DOCUMENT_LIMITS.maxNodes) break;
    }
  };
  if (errors.every((e) => e.code !== 'too-many-nodes' && e.code !== 'tree-too-deep'))
    collectClasses(doc.root, '$.root');

  if (!isRealTimestamp(doc.metadata.updatedAt)) {
    add(
      errors,
      'invalid-timestamp',
      '$.metadata.updatedAt',
      `${doc.metadata.updatedAt} is not a real calendar timestamp`,
    );
  }

  return { errors, warnings, elementIds: new Set(ids.keys()) };
}
