import { assertJsonValue } from '../json/canonical.ts';
import type { BuilderDocument, ElementNode } from '../schema/document.ts';
import { DOCUMENT_LIMITS } from '../schema/limits.ts';
import { IdSchema, PropertyIdSchema, type Json } from '../schema/primitives.ts';
import { StyleRuleSchema, type StyleRule } from '../schema/style.ts';
import { findPath, measure, nodeAt, replaceNode, subtreeIds, withChildren, type Path } from './tree.ts';
import type {
  Command,
  CommandContext,
  CommandError,
  CommandErrorCode,
  CommandResult,
  RuleSelector,
  StatusRecord,
} from './types.ts';

const fail = (code: CommandErrorCode, message: string): CommandResult => ({ ok: false, error: { code, message } });
const done = (document: BuilderDocument, inverse: Command): CommandResult => ({ ok: true, document, inverse });

const sameSelector = (rule: StyleRule, s: RuleSelector): boolean =>
  (rule.breakpoint ?? undefined) === (s.breakpoint ?? undefined) &&
  (rule.mode ?? undefined) === (s.mode ?? undefined) &&
  (rule.state ?? undefined) === (s.state ?? undefined);

function allIds(root: readonly ElementNode[]): Set<string> {
  const ids = new Set<string>();
  const stack = [...root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) break;
    ids.add(node.id);
    for (const child of node.children) stack.push(child);
  }
  return ids;
}

/** Every nesting inside a subtree, plus the subtree root under `parentType`, must be allowed by the registry hook. */
function nestingAllowed(parentType: string | null, node: ElementNode, ctx: CommandContext): boolean {
  if (ctx.canNest === undefined) return true;
  const stack: { parent: string | null; node: ElementNode }[] = [{ parent: parentType, node }];
  while (stack.length > 0) {
    const item = stack.pop();
    if (item === undefined) break;
    if (!ctx.canNest(item.parent, item.node.type)) return false;
    for (const child of item.node.children) stack.push({ parent: item.node.type, node: child });
  }
  return true;
}

/** Depth of the element at `parentPath` (0 for the page root). */
const depthOf = (parentPath: Path): number => parentPath.length;

function parentInfo(doc: BuilderDocument, parentId: string | null): { path: Path; node: ElementNode | null } | null {
  if (parentId === null) return { path: [], node: null };
  const path = findPath(doc.root, parentId);
  if (path === null) return null;
  const node = nodeAt(doc.root, path);
  return node === undefined ? null : { path, node };
}

function checkPlacement(
  doc: BuilderDocument,
  parent: { path: Path; node: ElementNode | null },
  index: number,
  subtree: ElementNode,
  listLength: number,
  ctx: CommandContext,
  removedNodes: number,
): CommandError | null {
  if (!Number.isInteger(index) || index < 0 || index > listLength)
    return { code: 'index-out-of-range', message: `index ${String(index)} is outside 0..${String(listLength)}` };
  const size = measure([subtree]);
  if (depthOf(parent.path) + size.depth > DOCUMENT_LIMITS.maxTreeDepth) {
    return {
      code: 'depth-exceeded',
      message: `the tree would be deeper than ${String(DOCUMENT_LIMITS.maxTreeDepth)} levels`,
    };
  }
  if (measure(doc.root).count - removedNodes + size.count > DOCUMENT_LIMITS.maxNodes) {
    return {
      code: 'node-limit-exceeded',
      message: `the document would have more than ${String(DOCUMENT_LIMITS.maxNodes)} elements`,
    };
  }
  if (!nestingAllowed(parent.node?.type ?? null, subtree, ctx)) {
    return {
      code: 'disallowed-parent',
      message: `${subtree.type} may not be placed inside ${parent.node?.type ?? 'the page root'}`,
    };
  }
  return null;
}

function insertAt(
  doc: BuilderDocument,
  parent: { path: Path; node: ElementNode | null },
  index: number,
  element: ElementNode,
): BuilderDocument {
  return { ...doc, root: withChildren(doc.root, parent.path, (list) => (list.splice(index, 0, element), list)) };
}

function setStatuses(doc: BuilderDocument, records: readonly StatusRecord[]): BuilderDocument {
  if (records.length === 0) return doc;
  const translations = { ...doc.translations };
  for (const r of records) {
    const stream = translations[r.locale];
    const entry = stream?.[r.elementId];
    if (stream === undefined || entry === undefined) continue;
    translations[r.locale] = { ...stream, [r.elementId]: { ...entry, status: r.status as typeof entry.status } };
  }
  return { ...doc, translations };
}

/**
 * Applies one command to a document and returns the new document plus the exact inverse command. Pure: the input document
 * is never modified (unchanged subtrees are shared), and a failing command returns an error and changes nothing.
 */
export function applyCommand(doc: BuilderDocument, command: Command, ctx: CommandContext = {}): CommandResult {
  switch (command.type) {
    case 'insert':
    case 'restore': {
      const { element } = command;
      const parent = parentInfo(doc, command.parentId);
      if (parent === null) return fail('parent-not-found', `no element with id ${String(command.parentId)}`);
      const existing = allIds(doc.root);
      const incoming = subtreeIds(element);
      if (new Set(incoming).size !== incoming.length) return fail('duplicate-id', 'the new subtree uses an id twice');
      const clash = incoming.find((id) => existing.has(id));
      if (clash !== undefined) return fail('duplicate-id', `element id ${clash} already exists`);
      if (command.type === 'insert') {
        const orphaned = incoming.find((id) =>
          Object.values(doc.translations).some((stream) => stream[id] !== undefined),
        );
        if (orphaned !== undefined)
          return fail(
            'id-has-orphaned-translations',
            `${orphaned} still has (orphaned) translations; use a fresh id or restore it by undoing the removal`,
          );
      }
      const list = parent.node === null ? doc.root : parent.node.children;
      const problem = checkPlacement(doc, parent, command.index, element, list.length, ctx, 0);
      if (problem !== null) return { ok: false, error: problem };
      const inserted = insertAt(doc, parent, command.index, element);
      const result = command.type === 'restore' ? setStatuses(inserted, command.statuses) : inserted;
      return done(result, { type: 'remove', id: element.id });
    }

    case 'remove': {
      const path = findPath(doc.root, command.id);
      if (path === null) return fail('element-not-found', `no element with id ${command.id}`);
      const node = nodeAt(doc.root, path);
      if (node === undefined) return fail('element-not-found', `no element with id ${command.id}`);
      const parentPath = path.slice(0, -1);
      const index = path[path.length - 1] ?? 0;
      const parentNode = parentPath.length === 0 ? null : nodeAt(doc.root, parentPath);
      const ids = new Set(subtreeIds(node));
      // Translations of removed elements are kept and marked orphaned, never dropped (ADR 0004).
      const statuses: StatusRecord[] = [];
      const translations: BuilderDocument['translations'] = {};
      for (const [locale, stream] of Object.entries(doc.translations)) {
        const next = { ...stream };
        for (const id of ids) {
          const entry = stream[id];
          if (entry !== undefined && entry.status !== 'orphaned') {
            statuses.push({ locale, elementId: id, status: entry.status });
            next[id] = { ...entry, status: 'orphaned' };
          }
        }
        translations[locale] = next;
      }
      const root = withChildren(doc.root, parentPath, (list) => (list.splice(index, 1), list));
      return done(
        { ...doc, root, translations },
        { type: 'restore', parentId: parentNode?.id ?? null, index, element: node, statuses },
      );
    }

    case 'move': {
      const path = findPath(doc.root, command.id);
      if (path === null) return fail('element-not-found', `no element with id ${command.id}`);
      const node = nodeAt(doc.root, path);
      if (node === undefined) return fail('element-not-found', `no element with id ${command.id}`);
      if (command.parentId !== null && subtreeIds(node).includes(command.parentId))
        return fail('cycle', 'an element cannot be moved into itself or its own descendants');
      const oldParentPath = path.slice(0, -1);
      const oldIndex = path[path.length - 1] ?? 0;
      const oldParent = oldParentPath.length === 0 ? null : nodeAt(doc.root, oldParentPath);
      // Index semantics: position in the target list after the element has been taken out of its old place.
      const without: BuilderDocument = {
        ...doc,
        root: withChildren(doc.root, oldParentPath, (list) => (list.splice(oldIndex, 1), list)),
      };
      const parent = parentInfo(without, command.parentId);
      if (parent === null) return fail('parent-not-found', `no element with id ${String(command.parentId)}`);
      const list = parent.node === null ? without.root : parent.node.children;
      const problem = checkPlacement(without, parent, command.index, node, list.length, ctx, 0);
      if (problem !== null) return { ok: false, error: problem };
      return done(insertAt(without, parent, command.index, node), {
        type: 'move',
        id: command.id,
        parentId: oldParent?.id ?? null,
        index: oldIndex,
      });
    }

    case 'update-props': {
      const path = findPath(doc.root, command.id);
      if (path === null) return fail('element-not-found', `no element with id ${command.id}`);
      const set = command.set ?? {};
      const unset = command.unset ?? [];
      for (const key of [...Object.keys(set), ...unset]) {
        if (!PropertyIdSchema.safeParse(key).success)
          return fail('invalid-argument', `${key} is not a valid property id`);
      }
      if (unset.some((k) => k in set))
        return fail('invalid-argument', 'a property cannot be set and unset in one command');
      try {
        for (const value of Object.values(set)) assertJsonValue(value);
      } catch (error) {
        return fail('invalid-argument', error instanceof Error ? error.message : 'invalid property value');
      }
      const node = nodeAt(doc.root, path);
      if (node === undefined) return fail('element-not-found', `no element with id ${command.id}`);
      const previousSet: Record<string, Json> = {};
      const previousUnset: string[] = [];
      const props: Record<string, Json> = { ...node.props };
      for (const key of Object.keys(set)) {
        if (key in node.props) previousSet[key] = node.props[key] as Json;
        else previousUnset.push(key);
        props[key] = set[key] as Json;
      }
      for (const key of unset) {
        if (key in node.props) {
          previousSet[key] = node.props[key] as Json;
          Reflect.deleteProperty(props, key);
        }
      }
      return done(
        { ...doc, root: replaceNode(doc.root, path, (n) => ({ ...n, props })) },
        { type: 'update-props', id: command.id, set: previousSet, unset: previousUnset },
      );
    }

    case 'set-style-rule': {
      const path = findPath(doc.root, command.id);
      if (path === null) return fail('element-not-found', `no element with id ${command.id}`);
      const node = nodeAt(doc.root, path);
      if (node === undefined) return fail('element-not-found', `no element with id ${command.id}`);
      if (command.declarations !== null) {
        const check = StyleRuleSchema.safeParse({
          ...stripUndefined(command.selector),
          declarations: command.declarations,
        });
        if (!check.success) return fail('invalid-argument', check.error.issues[0]?.message ?? 'invalid style rule');
      }
      const rules = node.style ?? [];
      const at = rules.findIndex((r) => sameSelector(r, command.selector));
      let next: StyleRule[];
      let inverse: Command;
      if (command.declarations === null) {
        if (at < 0)
          return done(doc, { type: 'set-style-rule', id: command.id, selector: command.selector, declarations: null });
        const removed = rules[at];
        if (removed === undefined) return fail('invalid-argument', 'style rule disappeared');
        next = rules.filter((_, i) => i !== at);
        inverse = {
          type: 'set-style-rule',
          id: command.id,
          selector: command.selector,
          declarations: { ...removed.declarations },
          index: at,
        };
      } else if (at >= 0) {
        const previous = rules[at];
        if (previous === undefined) return fail('invalid-argument', 'style rule disappeared');
        next = rules.map((r, i) => (i === at ? { ...r, declarations: { ...command.declarations } } : r));
        inverse = {
          type: 'set-style-rule',
          id: command.id,
          selector: command.selector,
          declarations: { ...previous.declarations },
        };
      } else {
        const position = command.index ?? rules.length;
        if (!Number.isInteger(position) || position < 0 || position > rules.length)
          return fail('index-out-of-range', `rule index ${String(position)} is outside 0..${String(rules.length)}`);
        const rule: StyleRule = { ...stripUndefined(command.selector), declarations: { ...command.declarations } };
        next = [...rules.slice(0, position), rule, ...rules.slice(position)];
        inverse = {
          type: 'set-style-rule',
          id: command.id,
          selector: command.selector,
          declarations: null,
          emptyAs: node.style === undefined ? 'omit' : 'keep',
        };
      }
      const updated = replaceNode(doc.root, path, (n) => {
        const rest: ElementNode = { ...n };
        Reflect.deleteProperty(rest, 'style');
        if (next.length === 0) return command.emptyAs === 'keep' ? { ...rest, style: [] } : rest;
        return { ...rest, style: next };
      });
      return done({ ...doc, root: updated }, inverse);
    }

    case 'set-class-ids': {
      const path = findPath(doc.root, command.id);
      if (path === null) return fail('element-not-found', `no element with id ${command.id}`);
      const node = nodeAt(doc.root, path);
      if (node === undefined) return fail('element-not-found', `no element with id ${command.id}`);
      if (command.classIds !== null) {
        if (command.classIds.length > 64 || new Set(command.classIds).size !== command.classIds.length)
          return fail('invalid-argument', 'classIds must be unique and at most 64');
        for (const id of command.classIds) {
          if (!IdSchema.safeParse(id).success) return fail('invalid-argument', `${id} is not a valid class id`);
          if (!(id in doc.classRefs))
            return fail('invalid-argument', `class ${id} is not referenced by this document (classRefs)`);
        }
      }
      const root = replaceNode(doc.root, path, (n) => {
        const rest: ElementNode = { ...n };
        Reflect.deleteProperty(rest, 'classIds');
        return command.classIds === null ? rest : { ...rest, classIds: [...command.classIds] };
      });
      return done(
        { ...doc, root },
        { type: 'set-class-ids', id: command.id, classIds: node.classIds === undefined ? null : [...node.classIds] },
      );
    }
  }
}

function stripUndefined(selector: RuleSelector): RuleSelector {
  const out: RuleSelector = {};
  if (selector.breakpoint !== undefined) out.breakpoint = selector.breakpoint;
  if (selector.mode !== undefined) out.mode = selector.mode;
  if (selector.state !== undefined) out.state = selector.state;
  return out;
}
