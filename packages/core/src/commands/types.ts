import type { BuilderDocument, ElementNode } from '../schema/document.ts';
import type { Json } from '../schema/primitives.ts';

/** Which style rule a command targets: the sparse breakpoint/mode/state combination (ADR 0005). */
export interface RuleSelector {
  breakpoint?: string | undefined;
  mode?: 'light' | 'dark' | undefined;
  state?: 'hover' | 'focus' | 'focus-visible' | 'active' | undefined;
}

/** Previous translation status of an entry, kept so undoing a removal restores it exactly. */
export interface StatusRecord {
  locale: string;
  elementId: string;
  status: string;
}

/**
 * Document edits (docs/architecture/SYSTEM.md, "Editor"). Commands are plain data. Ids are supplied by the caller (never
 * generated here) so that applying the same commands to the same document is deterministic.
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
  'disallowed-parent',
  'invalid-argument',
] as const;
export type CommandErrorCode = (typeof COMMAND_ERROR_CODES)[number];

export interface CommandError {
  code: CommandErrorCode;
  message: string;
}

export type CommandResult =
  { ok: true; document: BuilderDocument; inverse: Command } | { ok: false; error: CommandError };

/** Extra rules supplied by the element registry (BWB-021). Without a registry every nesting is allowed. */
export interface CommandContext {
  /** May an element of `childType` be placed inside `parentType` (`null` = the page root)? */
  canNest?: (parentType: string | null, childType: string) => boolean;
}
