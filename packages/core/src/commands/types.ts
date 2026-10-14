import type { BuilderDocument, ElementNode } from '../schema/document.ts';
import type { Json } from '../schema/primitives.ts';
import type { StyleRule } from '../schema/style.ts';

/** Which style rule a command targets: the sparse breakpoint/mode/state combination (ADR 0005). Absent = not part of the key. */
export interface RuleSelector {
  breakpoint?: string;
  mode?: 'light' | 'dark';
  state?: 'hover' | 'focus' | 'focus-visible' | 'active';
}

/** Previous translation status of an entry, kept so undoing a removal restores it exactly. */
export interface StatusRecord {
  locale: string;
  elementId: string;
  status: string;
}

/**
 * Document edits (docs/architecture/SYSTEM.md, "Editor"). Commands are plain JSON data. Ids are supplied by the caller
 * (never generated here) so that applying the same commands to the same document is deterministic. `applyCommand` copies a
 * command once into an inert snapshot before using it, so mutating a command object afterwards changes nothing.
 */
export type Command =
  | { type: 'insert'; parentId: string | null; index: number; element: ElementNode }
  | { type: 'remove'; id: string }
  | { type: 'move'; id: string; parentId: string | null; index: number }
  | { type: 'update-props'; id: string; set?: Record<string, Json>; unset?: string[] }
  | {
      type: 'set-style-rule';
      id: string;
      selector: RuleSelector;
      /** `null` removes the rule. */
      declarations: Record<string, string | number> | null;
      /** Position when a rule is (re)created; defaults to the end. */
      index?: number;
      /** What to leave behind when the last rule is removed: no `style` field (default) or an empty list. Used by inverses. */
      emptyAs?: 'omit' | 'keep';
    }
  /** Produced as the inverse of removing a style rule: puts back the complete rule, unknown fields included. */
  | { type: 'restore-style-rule'; id: string; index: number; rule: StyleRule }
  | { type: 'set-class-ids'; id: string; classIds: string[] | null }
  /** Produced as the inverse of `remove`: puts the subtree back and restores its translation statuses. */
  | { type: 'restore'; parentId: string | null; index: number; element: ElementNode; statuses: StatusRecord[] };

export const COMMAND_ERROR_CODES = [
  'element-not-found',
  'parent-not-found',
  'duplicate-id',
  'id-has-orphaned-translations',
  'index-out-of-range',
  'cycle',
  'depth-exceeded',
  'node-limit-exceeded',
  'document-too-large',
  'disallowed-parent',
  'invalid-argument',
  'stale-restore',
] as const;
export type CommandErrorCode = (typeof COMMAND_ERROR_CODES)[number];

export interface CommandError {
  code: CommandErrorCode;
  message: string;
}

export type CommandResult =
  /** `command` is the inert copy that was actually applied; store this, not the object the caller passed. */
  { ok: true; document: BuilderDocument; inverse: Command; command: Command } | { ok: false; error: CommandError };

/** Extra rules supplied by the element registry (BWB-021). Without a registry every nesting is allowed. */
export interface CommandContext {
  /**
   * May an element of `childType` be placed inside `parentType` (`null` = the page root)? `intent` is `create` for new content
   * (insert: every nesting in the subtree is asked) and `relocate` for existing content (move and restore: only the subtree's
   * root placement is asked, because nestings inside an unchanged subtree do not change; this lets a document whose add-on is
   * gone still be rearranged). Must be a pure predicate; if it throws, the command fails with `invalid-argument`.
   */
  canNest?: (parentType: string | null, childType: string, intent: 'create' | 'relocate') => boolean;
}
