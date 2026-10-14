import { admitValue } from '../document/gates.ts';
import { canonicalJson } from '../json/canonical.ts';
import { estimateJsonBytes } from '../json/estimate.ts';
import type { BuilderDocument, ElementNode } from '../schema/document.ts';
import { DOCUMENT_LIMITS } from '../schema/limits.ts';
import type { Json } from '../schema/primitives.ts';
import type { StyleRule } from '../schema/style.ts';
import { CommandSchema } from './schema.ts';
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

const MAX_STYLE_RULES = 256;

const own = (object: object, key: string): boolean => Object.hasOwn(object, key);
const fail = (code: CommandErrorCode, message: string): { ok: false; error: CommandError } => ({
  ok: false,
  error: { code, message },
});

type Outcome = { document: BuilderDocument; inverse: Command } | { ok: false; error: CommandError };
const isError = (o: Outcome): o is { ok: false; error: CommandError } => 'error' in o;

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

/** Class ids used anywhere in a subtree. */
function classIdsIn(node: ElementNode): string[] {
  const found: string[] = [];
  const stack = [node];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    found.push(...(current.classIds ?? []));
    for (const child of current.children) stack.push(child);
  }
  return found;
}

/** Every nesting inside a subtree, plus the subtree root under `parentType`, must be allowed by the registry hook. */
function nestingAllowed(
  parentType: string | null,
  node: ElementNode,
  ctx: CommandContext,
  intent: 'create' | 'relocate',
): boolean {
  if (ctx.canNest === undefined) return true;
  // Relocating unchanged content only changes how its root is attached; nestings inside the subtree stay as they were.
  if (intent === 'relocate') return ctx.canNest(parentType, node.type, intent);
  const stack: { parent: string | null; node: ElementNode }[] = [{ parent: parentType, node }];
  while (stack.length > 0) {
    const item = stack.pop();
    if (item === undefined) break;
    if (!ctx.canNest(item.parent, item.node.type, intent)) return false;
    for (const child of item.node.children) stack.push({ parent: item.node.type, node: child });
  }
  return true;
}

interface Parent {
  path: Path;
  node: ElementNode | null;
}

function parentInfo(doc: BuilderDocument, parentId: string | null): Parent | null {
  if (parentId === null) return { path: [], node: null };
  const path = findPath(doc.root, parentId);
  if (path === null) return null;
  const node = nodeAt(doc.root, path);
  return node === undefined ? null : { path, node };
}

function checkPlacement(
  doc: BuilderDocument,
  parent: Parent,
  index: number,
  subtree: ElementNode,
  listLength: number,
  ctx: CommandContext,
  intent: 'create' | 'relocate',
): CommandError | null {
  if (index < 0 || index > listLength)
    return { code: 'index-out-of-range', message: `index ${String(index)} is outside 0..${String(listLength)}` };
  const size = measure([subtree]);
  if (parent.path.length + size.depth > DOCUMENT_LIMITS.maxTreeDepth) {
    return {
      code: 'depth-exceeded',
      message: `the tree would be deeper than ${String(DOCUMENT_LIMITS.maxTreeDepth)} levels`,
    };
  }
  if (measure(doc.root).count + size.count > DOCUMENT_LIMITS.maxNodes) {
    return {
      code: 'node-limit-exceeded',
      message: `the document would have more than ${String(DOCUMENT_LIMITS.maxNodes)} elements`,
    };
  }
  if (!nestingAllowed(parent.node?.type ?? null, subtree, ctx, intent)) {
    return {
      code: 'disallowed-parent',
      message: `${subtree.type} may not be placed inside ${parent.node?.type ?? 'the page root'}`,
    };
  }
  return null;
}

function insertAt(doc: BuilderDocument, parent: Parent, index: number, element: ElementNode): BuilderDocument {
  return { ...doc, root: withChildren(doc.root, parent.path, (list) => (list.splice(index, 0, element), list)) };
}

function entryOf(
  doc: BuilderDocument,
  locale: string,
  id: string,
): BuilderDocument['translations'][string][string] | undefined {
  if (!own(doc.translations, locale)) return undefined;
  const stream = doc.translations[locale];
  return stream !== undefined && own(stream, id) ? stream[id] : undefined;
}

function setStatuses(doc: BuilderDocument, records: readonly StatusRecord[]): BuilderDocument {
  if (records.length === 0) return doc;
  const translations = { ...doc.translations };
  for (const r of records) {
    const stream = translations[r.locale];
    const entry = stream !== undefined && own(stream, r.elementId) ? stream[r.elementId] : undefined;
    if (stream === undefined || entry === undefined) continue;
    translations[r.locale] = { ...stream, [r.elementId]: { ...entry, status: r.status as typeof entry.status } };
  }
  return { ...doc, translations };
}

function insertOrRestore(
  doc: BuilderDocument,
  command: Extract<Command, { type: 'insert' | 'restore' }>,
  ctx: CommandContext,
): Outcome {
  const { element } = command;
  const parent = parentInfo(doc, command.parentId);
  if (parent === null) return fail('parent-not-found', `no element with id ${String(command.parentId)}`);
  const existing = allIds(doc.root);
  const incoming = subtreeIds(element);
  if (new Set(incoming).size !== incoming.length) return fail('duplicate-id', 'the new subtree uses an id twice');
  const clash = incoming.find((id) => existing.has(id));
  if (clash !== undefined) return fail('duplicate-id', `element id ${clash} already exists`);
  const unknownClass = classIdsIn(element).find((id) => !own(doc.classRefs, id));
  if (unknownClass !== undefined)
    return fail('invalid-argument', `class ${unknownClass} is not referenced by this document (classRefs)`);
  if (command.type === 'insert') {
    const orphaned = incoming.find((id) => Object.values(doc.translations).some((stream) => own(stream, id)));
    if (orphaned !== undefined)
      return fail(
        'id-has-orphaned-translations',
        `${orphaned} still has (orphaned) translations; use a fresh id or restore it by undoing the removal`,
      );
  } else {
    // A restore must match the state `remove` left behind; anything else is a stale or unrelated record.
    const incomingSet = new Set(incoming);
    const seen = new Set<string>();
    for (const r of command.statuses) {
      const key = `${r.locale}\u0000${r.elementId}`;
      if (seen.has(key)) return fail('invalid-argument', 'duplicate status record');
      seen.add(key);
      if (!incomingSet.has(r.elementId))
        return fail('stale-restore', `status record for ${r.elementId}, which is not part of the restored subtree`);
      if (r.status === 'orphaned')
        return fail('invalid-argument', 'a status record cannot restore the orphaned status');
      if (entryOf(doc, r.locale, r.elementId)?.status !== 'orphaned')
        return fail('stale-restore', `${r.locale}/${r.elementId} is not orphaned, so it cannot be restored`);
    }
  }
  const list = parent.node === null ? doc.root : parent.node.children;
  const problem = checkPlacement(
    doc,
    parent,
    command.index,
    element,
    list.length,
    ctx,
    command.type === 'insert' ? 'create' : 'relocate',
  );
  if (problem !== null) return { ok: false, error: problem };
  const inserted = insertAt(doc, parent, command.index, element);
  return {
    document: command.type === 'restore' ? setStatuses(inserted, command.statuses) : inserted,
    inverse: { type: 'remove', id: element.id },
  };
}

function remove(doc: BuilderDocument, id: string): Outcome {
  const path = findPath(doc.root, id);
  const node = path === null ? undefined : nodeAt(doc.root, path);
  if (path === null || node === undefined) return fail('element-not-found', `no element with id ${id}`);
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1] ?? 0;
  const parentNode = parentPath.length === 0 ? null : nodeAt(doc.root, parentPath);
  const ids = subtreeIds(node);
  // Translations of removed elements are kept and marked orphaned, never dropped (ADR 0004).
  const statuses: StatusRecord[] = [];
  const translations: BuilderDocument['translations'] = {};
  for (const [locale, stream] of Object.entries(doc.translations)) {
    const next = { ...stream };
    for (const elementId of ids) {
      const entry = own(stream, elementId) ? stream[elementId] : undefined;
      if (entry !== undefined && entry.status !== 'orphaned') {
        statuses.push({ locale, elementId, status: entry.status });
        next[elementId] = { ...entry, status: 'orphaned' };
      }
    }
    translations[locale] = next;
  }
  const root = withChildren(doc.root, parentPath, (list) => (list.splice(index, 1), list));
  return {
    document: { ...doc, root, translations },
    inverse: { type: 'restore', parentId: parentNode?.id ?? null, index, element: node, statuses },
  };
}

function move(doc: BuilderDocument, command: Extract<Command, { type: 'move' }>, ctx: CommandContext): Outcome {
  const path = findPath(doc.root, command.id);
  const node = path === null ? undefined : nodeAt(doc.root, path);
  if (path === null || node === undefined) return fail('element-not-found', `no element with id ${command.id}`);
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
  const problem = checkPlacement(without, parent, command.index, node, list.length, ctx, 'relocate');
  if (problem !== null) return { ok: false, error: problem };
  return {
    document: insertAt(without, parent, command.index, node),
    inverse: { type: 'move', id: command.id, parentId: oldParent?.id ?? null, index: oldIndex },
  };
}

function updateProps(doc: BuilderDocument, command: Extract<Command, { type: 'update-props' }>): Outcome {
  const path = findPath(doc.root, command.id);
  const node = path === null ? undefined : nodeAt(doc.root, path);
  if (path === null || node === undefined) return fail('element-not-found', `no element with id ${command.id}`);
  const set = command.set ?? {};
  const unset = command.unset ?? [];
  if (unset.some((k) => own(set, k)))
    return fail('invalid-argument', 'a property cannot be set and unset in one command');
  // Own-property checks only: `toString` and friends are valid property ids but also exist on every object's prototype.
  const previousSet: Record<string, Json> = {};
  const previousUnset: string[] = [];
  const props: Record<string, Json> = { ...node.props };
  for (const key of Object.keys(set)) {
    if (own(node.props, key)) previousSet[key] = node.props[key] as Json;
    else previousUnset.push(key);
    Object.defineProperty(props, key, { value: set[key], enumerable: true, writable: true, configurable: true });
  }
  for (const key of unset) {
    if (own(node.props, key)) {
      previousSet[key] = node.props[key] as Json;
      Reflect.deleteProperty(props, key);
    }
  }
  return {
    document: { ...doc, root: replaceNode(doc.root, path, (n) => ({ ...n, props })) },
    inverse: { type: 'update-props', id: command.id, set: previousSet, unset: previousUnset },
  };
}

function withStyle(
  doc: BuilderDocument,
  path: Path,
  next: StyleRule[],
  emptyAs: 'omit' | 'keep' | undefined,
): BuilderDocument {
  return {
    ...doc,
    root: replaceNode(doc.root, path, (n) => {
      const rest: ElementNode = { ...n };
      Reflect.deleteProperty(rest, 'style');
      if (next.length === 0) return emptyAs === 'keep' ? { ...rest, style: [] } : rest;
      return { ...rest, style: next };
    }),
  };
}

function setStyleRule(doc: BuilderDocument, command: Extract<Command, { type: 'set-style-rule' }>): Outcome {
  const path = findPath(doc.root, command.id);
  const node = path === null ? undefined : nodeAt(doc.root, path);
  if (path === null || node === undefined) return fail('element-not-found', `no element with id ${command.id}`);
  const rules = node.style ?? [];
  const at = rules.findIndex((r) => sameSelector(r, command.selector));
  const selector = command.selector;
  if (command.declarations === null) {
    const removed = at < 0 ? undefined : rules[at];
    if (removed === undefined)
      return { document: doc, inverse: { type: 'set-style-rule', id: command.id, selector, declarations: null } };
    const next = rules.filter((_, i) => i !== at);
    return {
      document: withStyle(doc, path, next, command.emptyAs),
      inverse: { type: 'restore-style-rule', id: command.id, index: at, rule: removed },
    };
  }
  if (at >= 0) {
    const previous = rules[at];
    if (previous === undefined) return fail('invalid-argument', 'style rule disappeared');
    const next = rules.map((r, i) => (i === at ? { ...r, declarations: { ...command.declarations } } : r));
    return {
      document: withStyle(doc, path, next, command.emptyAs),
      inverse: { type: 'set-style-rule', id: command.id, selector, declarations: { ...previous.declarations } },
    };
  }
  if (rules.length >= MAX_STYLE_RULES)
    return fail('invalid-argument', `an element can have at most ${String(MAX_STYLE_RULES)} style rules`);
  const position = command.index ?? rules.length;
  if (position < 0 || position > rules.length)
    return fail('index-out-of-range', `rule index ${String(position)} is outside 0..${String(rules.length)}`);
  const rule: StyleRule = { ...selector, declarations: { ...command.declarations } };
  const next = [...rules.slice(0, position), rule, ...rules.slice(position)];
  return {
    document: withStyle(doc, path, next, undefined),
    inverse: {
      type: 'set-style-rule',
      id: command.id,
      selector,
      declarations: null,
      emptyAs: node.style === undefined ? 'omit' : 'keep',
    },
  };
}

function restoreStyleRule(doc: BuilderDocument, command: Extract<Command, { type: 'restore-style-rule' }>): Outcome {
  const path = findPath(doc.root, command.id);
  const node = path === null ? undefined : nodeAt(doc.root, path);
  if (path === null || node === undefined) return fail('element-not-found', `no element with id ${command.id}`);
  const rules = node.style ?? [];
  const selector: RuleSelector = {
    ...(command.rule.breakpoint === undefined ? {} : { breakpoint: command.rule.breakpoint }),
    ...(command.rule.mode === undefined ? {} : { mode: command.rule.mode }),
    ...(command.rule.state === undefined ? {} : { state: command.rule.state }),
  };
  if (rules.some((r) => sameSelector(r, selector)))
    return fail('invalid-argument', 'a rule with this selector already exists');
  if (rules.length >= MAX_STYLE_RULES)
    return fail('invalid-argument', `an element can have at most ${String(MAX_STYLE_RULES)} style rules`);
  if (command.index < 0 || command.index > rules.length)
    return fail('index-out-of-range', `rule index ${String(command.index)} is outside 0..${String(rules.length)}`);
  const next = [...rules.slice(0, command.index), command.rule, ...rules.slice(command.index)];
  return {
    document: withStyle(doc, path, next, undefined),
    inverse: {
      type: 'set-style-rule',
      id: command.id,
      selector,
      declarations: null,
      emptyAs: node.style === undefined ? 'omit' : 'keep',
    },
  };
}

function setClassIds(doc: BuilderDocument, command: Extract<Command, { type: 'set-class-ids' }>): Outcome {
  const path = findPath(doc.root, command.id);
  const node = path === null ? undefined : nodeAt(doc.root, path);
  if (path === null || node === undefined) return fail('element-not-found', `no element with id ${command.id}`);
  if (command.classIds !== null) {
    if (new Set(command.classIds).size !== command.classIds.length)
      return fail('invalid-argument', 'classIds must be unique');
    const unknown = command.classIds.find((id) => !own(doc.classRefs, id));
    if (unknown !== undefined)
      return fail('invalid-argument', `class ${unknown} is not referenced by this document (classRefs)`);
  }
  const root = replaceNode(doc.root, path, (n) => {
    const rest: ElementNode = { ...n };
    Reflect.deleteProperty(rest, 'classIds');
    return command.classIds === null ? rest : { ...rest, classIds: [...command.classIds] };
  });
  return {
    document: { ...doc, root },
    inverse: {
      type: 'set-class-ids',
      id: command.id,
      classIds: node.classIds === undefined ? null : [...node.classIds],
    },
  };
}

function entryAllowed(doc: BuilderDocument, locale: string, elementId: string): CommandError | null {
  if (!doc.locales.includes(locale))
    return { code: 'locale-not-found', message: `${locale} is not a locale of this document` };
  const path = findPath(doc.root, elementId);
  if (path === null) return { code: 'element-not-found', message: `no element with id ${elementId}` };
  if (entryOf(doc, locale, elementId)?.status === 'orphaned')
    return { code: 'invalid-argument', message: `the translation of ${elementId} in ${locale} is orphaned` };
  return null;
}

function withEntry(
  doc: BuilderDocument,
  locale: string,
  elementId: string,
  entry: BuilderDocument['translations'][string][string] | null,
  dropStream = false,
): BuilderDocument {
  const stream = own(doc.translations, locale) ? { ...doc.translations[locale] } : {};
  if (entry === null) Reflect.deleteProperty(stream, elementId);
  else Object.defineProperty(stream, elementId, { value: entry, enumerable: true, writable: true, configurable: true });
  const translations = { ...doc.translations };
  if (entry === null && dropStream && Object.keys(stream).length === 0) Reflect.deleteProperty(translations, locale);
  else
    Object.defineProperty(translations, locale, {
      value: stream,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  return { ...doc, translations };
}

const sameValues = (a: Record<string, Json>, b: Record<string, Json>): boolean => canonicalJson(a) === canonicalJson(b);

function setTranslation(
  doc: BuilderDocument,
  command: Extract<Command, { type: 'set-translation' }>,
  ctx: CommandContext,
): Outcome {
  const problem = entryAllowed(doc, command.locale, command.elementId);
  if (problem !== null) return { ok: false, error: problem };
  const path = findPath(doc.root, command.elementId);
  const node = path === null ? undefined : nodeAt(doc.root, path);
  if (node === undefined) return fail('element-not-found', `no element with id ${command.elementId}`);
  const set = command.set ?? {};
  const unset = command.unset ?? [];
  if (unset.some((k) => own(set, k)))
    return fail('invalid-argument', 'a property cannot be set and unset in one command');
  const existing = entryOf(doc, command.locale, command.elementId);
  if (ctx.translationValue !== undefined) {
    for (const key of Object.keys(set)) {
      const checked = ctx.translationValue(node.type, key, set[key] as Json);
      if (!checked.ok) return fail(checked.code, `${key}: ${checked.message}`);
    }
    // Removing a value that is there is always allowed (it repairs legacy data); an id that is not there must at least be a
    // property that could hold a translation, so an editor bug does not pass silently.
    for (const key of unset) {
      if (existing !== undefined && own(existing.values, key)) continue;
      const checked = ctx.translationValue(node.type, key, null);
      if (!checked.ok && checked.code === 'not-translatable') return fail(checked.code, `${key}: ${checked.message}`);
    }
  }
  const values: Record<string, Json> = { ...(existing?.values ?? {}) };
  for (const key of unset) Reflect.deleteProperty(values, key);
  for (const key of Object.keys(set)) {
    Object.defineProperty(values, key, { value: set[key], enumerable: true, writable: true, configurable: true });
  }
  const previous = existing?.values ?? {};
  const valuesChanged = !sameValues(values, previous);
  // An edit that changes nothing keeps the entry as it is (a reviewed translation stays reviewed); only an explicit status
  // changes the status without changing values.
  if (!valuesChanged && command.status === undefined) {
    return {
      document: doc,
      inverse: {
        type: 'restore-translation',
        locale: command.locale,
        elementId: command.elementId,
        entry: existing ?? null,
      },
    };
  }
  const status = command.status ?? (command.locale === doc.defaultLocale ? 'translated' : 'draft');
  const entry = existing === undefined ? { values, status } : { ...existing, values, status };
  return {
    document: withEntry(doc, command.locale, command.elementId, entry),
    inverse: {
      type: 'restore-translation',
      locale: command.locale,
      elementId: command.elementId,
      entry: existing ?? null,
      ...(existing === undefined && !own(doc.translations, command.locale) ? { dropStream: true } : {}),
    },
  };
}

function restoreTranslation(
  doc: BuilderDocument,
  command: Extract<Command, { type: 'restore-translation' }>,
  ctx: CommandContext,
): Outcome {
  const problem = entryAllowed(doc, command.locale, command.elementId);
  if (problem !== null) return { ok: false, error: problem };
  if (command.entry?.status === 'orphaned')
    return fail('invalid-argument', 'an orphaned entry cannot be restored on a live element');
  if (command.dropStream === true && command.entry !== null)
    return fail('invalid-argument', 'dropStream only applies when the entry is removed');
  const existing = entryOf(doc, command.locale, command.elementId);
  if (command.entry !== null && ctx.translationValue !== undefined) {
    // A restore must not smuggle in what `set-translation` would refuse: values that differ from the current entry are asked.
    const node = nodeAt(doc.root, findPath(doc.root, command.elementId) ?? []);
    for (const [key, value] of Object.entries(command.entry.values)) {
      if (
        existing !== undefined &&
        own(existing.values, key) &&
        canonicalJson(existing.values[key] ?? null) === canonicalJson(value)
      )
        continue;
      const checked = ctx.translationValue(node?.type ?? '', key, value);
      if (!checked.ok) return fail(checked.code, `${key}: ${checked.message}`);
    }
  }
  return {
    document: withEntry(doc, command.locale, command.elementId, command.entry, command.dropStream === true),
    inverse: {
      type: 'restore-translation',
      locale: command.locale,
      elementId: command.elementId,
      entry: existing ?? null,
      ...(existing === undefined && !own(doc.translations, command.locale) ? { dropStream: true } : {}),
    },
  };
}

/** Limits that must hold for the *result*, whatever the command did. */
function checkResult(document: BuilderDocument): CommandError | null {
  const size = measure(document.root);
  if (size.depth > DOCUMENT_LIMITS.maxTreeDepth)
    return {
      code: 'depth-exceeded',
      message: `the tree would be deeper than ${String(DOCUMENT_LIMITS.maxTreeDepth)} levels`,
    };
  if (size.count > DOCUMENT_LIMITS.maxNodes)
    return {
      code: 'node-limit-exceeded',
      message: `the document would have more than ${String(DOCUMENT_LIMITS.maxNodes)} elements`,
    };
  if (estimateJsonBytes(document) > DOCUMENT_LIMITS.maxBytes)
    return {
      code: 'document-too-large',
      message: `the document would be larger than ${String(DOCUMENT_LIMITS.maxBytes)} bytes`,
    };
  return null;
}

/**
 * Applies one command to a document and returns the new document plus the exact inverse command. Pure: the input document
 * is never modified (unchanged subtrees are shared), and a failing command returns an error and changes nothing.
 *
 * The command is copied once into an inert snapshot and validated against `CommandSchema` before it is used, the result is
 * checked against the document limits, and nothing is thrown: a malformed command, a hostile object or a throwing
 * `canNest` hook all become `invalid-argument`. The returned `command` is the snapshot that was applied.
 */
export function applyCommand(doc: BuilderDocument, input: unknown, ctx: CommandContext = {}): CommandResult {
  try {
    const admitted = admitValue(input);
    if (!admitted.ok)
      return fail(
        'invalid-argument',
        `${admitted.issues[0]?.code ?? 'rejected'}: ${admitted.issues[0]?.message ?? 'the command was rejected'}`,
      );
    const parsed = CommandSchema.safeParse(admitted.value);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return fail(
        'invalid-argument',
        `${issue?.path.join('.') ?? ''}: ${issue?.message ?? 'invalid command'}`.replace(/^: /, ''),
      );
    }
    const command = parsed.data as Command;
    let outcome: Outcome;
    switch (command.type) {
      case 'insert':
      case 'restore':
        outcome = insertOrRestore(doc, command, ctx);
        break;
      case 'remove':
        outcome = remove(doc, command.id);
        break;
      case 'move':
        outcome = move(doc, command, ctx);
        break;
      case 'update-props':
        outcome = updateProps(doc, command);
        break;
      case 'set-style-rule':
        outcome = setStyleRule(doc, command);
        break;
      case 'restore-style-rule':
        outcome = restoreStyleRule(doc, command);
        break;
      case 'set-class-ids':
        outcome = setClassIds(doc, command);
        break;
      case 'set-translation':
        outcome = setTranslation(doc, command, ctx);
        break;
      case 'restore-translation':
        outcome = restoreTranslation(doc, command, ctx);
        break;
    }
    if (isError(outcome)) return outcome;
    const problem = outcome.document === doc ? null : checkResult(outcome.document);
    if (problem !== null) return { ok: false, error: problem };
    return { ok: true, document: outcome.document, inverse: outcome.inverse, command };
  } catch (error) {
    return fail(
      'invalid-argument',
      `the command could not be applied: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }
}
